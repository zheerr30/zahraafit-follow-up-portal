import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toGender } from "@/lib/gender-core";
import { PUSH_MAX, cardFor, cleanLine, fillTemplate, focusOf, mergeTemplates, type DayNumbers, type Focus, type Templates } from "@/lib/day-summary";

// Makes the end-of-day summaries that are due (public.day_summary_due) and saves each one
// with its notification (public.day_summary_save). Subscribers: a short line from Claude
// (light model). Free accounts: the coach's ready sentences.

const MODEL = "claude-haiku-5-5";

type Due = DayNumbers & {
  profile_id: string; male: boolean | null; hide: boolean; sub: boolean; period: boolean; logged: boolean; coach_note: string | null;
};

const SCHEMA = {
  type: "object",
  properties: { push: { type: "string" }, rec: { type: "string" } },
  required: ["push", "rec"],
  additionalProperties: false
};

const FOCUS_EN: Record<Focus, string> = {
  protein: "protein was the biggest gap (under 85% of the protein target)",
  cal_low: "calories were more than 15% under the target",
  cal_high: "calories were more than 15% over the target",
  water: "water was under 85% of the goal",
  meals: "some of the plan's meals were skipped",
  excellent: "an excellent day: everything at or above 85% of the goals"
};

function prompt(d: Due, focus: Focus) {
  const male = d.male === true;
  return [
    `You write the end-of-day summary for a subscriber of ZahraaFit, a Saudi fitness coach's app. The subscriber is ${male ? "a man: address him in the masculine" : "a woman: address her in the feminine"}.`,
    "Write in direct, warm Saudi dialect. No emoji, no exclamation marks, no shadda (ّ), no greetings.",
    `Today's main point: ${FOCUS_EN[focus]}.`,
    focus === "excellent"
      ? `"push": ONE short sentence of appreciation for today (at most ${PUSH_MAX} characters), no advice. "rec": an empty string.`
      : `"push": ONE sentence of at most ${PUSH_MAX} characters: what happened today on the main point, then one practical thing for tomorrow. "rec": 1 or 2 short sentences with a practical, specific recommendation for TOMORROW about the main point only (e.g. what to add to breakfast, when to drink).`,
    "Only behaviour: what and when to eat or drink, preparing meals, logging. Never change the calorie or macro targets or the plan, never medical talk, medicines or supplements. No blame and no exaggerated praise.",
    d.hide
      ? "This person chose not to see numbers: write NO digits at all (no calories, grams, cups or percentages). Use words like «أقل من هدفك بشوي»."
      : "You may use one number from the data in the push when it helps (calories, protein grams or cups).",
    d.period ? "These are period days: do not mention weight at all." : "Do not mention weight.",
    d.coach_note ? `The coach's latest note to this subscriber is below. Never contradict it; you can support it.\n<coach_note>\n${d.coach_note.slice(0, 1200)}\n</coach_note>` : "",
    "Use only this data (null = no goal set, do not compare to a goal):",
    JSON.stringify({
      calories: Math.round(d.cal), calorie_target: d.target_cal, protein_g: Math.round(d.p), protein_target_g: d.target_p,
      carbs_g: Math.round(d.c), fat_g: Math.round(d.f), water_cups: d.water, water_goal_cups: d.water_goal || 8,
      plan_meals_eaten: d.meals_done, plan_meals_today: d.meals_total
    })
  ].filter(Boolean).join("\n\n");
}

/** Cuts a too-long line at a word, never mid-word. */
function fit(s: string) {
  if (s.length <= PUSH_MAX) return s;
  const cut = s.slice(0, PUSH_MAX + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), PUSH_MAX - 20)).replace(/[،,.:\s]+$/, "");
}

async function fromClaude(ai: Anthropic, d: Due, focus: Focus): Promise<{ push: string; rec: string } | null> {
  try {
    const res = await ai.messages.create({
      model: MODEL,
      max_tokens: 600,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt(d, focus) }]
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const o = JSON.parse(text.text) as { push?: unknown; rec?: unknown };
    const push = cleanLine(String(o.push || ""));
    const rec = focus === "excellent" ? "" : cleanLine(String(o.rec || ""));
    if (push.length < 8 || push.length > PUSH_MAX || rec.length > 260) return null;
    if (d.hide && /[0-9٠-٩]/.test(push + rec)) return null;
    return { push, rec };
  } catch {
    return null;
  }
}

function fromTemplate(t: Templates, d: Due, key: Focus | "nolog") {
  const tpl = t[key];
  const hasGoals = key === "protein" ? d.target_p : key === "cal_low" || key === "cal_high" ? d.target_cal : true;
  return {
    push: fit(cleanLine(fillTemplate(d.hide || !hasGoals ? tpl.plain : tpl.push, d))),
    rec: cleanLine(d.hide ? tpl.rec.replace(/[0-9٠-٩]+/g, "") : fillTemplate(tpl.rec, d))
  };
}

export async function runDaySummaries(db: SupabaseClient, secret: string) {
  const { data, error } = await db.rpc("day_summary_due", { p_secret: secret });
  if (error || !Array.isArray(data) || !data.length) return 0;
  const due = (data as Due[]).map((d) => ({ ...d, cal: +d.cal || 0, p: +d.p || 0, c: +d.c || 0, f: +d.f || 0, water: +d.water || 0, meals_done: +d.meals_done || 0, meals_total: +d.meals_total || 0 }));

  const { data: st } = await db.from("app_settings").select("value").eq("key", "day_summary_templates").maybeSingle();
  const templates = mergeTemplates(st?.value);
  const ai = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

  let made = 0;
  // A few at a time, so a busy evening doesn't hit the model's limits all at once.
  for (let i = 0; i < due.length; i += 5) {
    await Promise.all(
      due.slice(i, i + 5).map(async (d) => {
        const g = d.male ? "male" : "female";
        const kind = !d.logged ? "nolog" : null;
        const focus = kind ? null : focusOf(d);
        let out = kind ? fromTemplate(templates, d, "nolog") : null;
        if (!out && d.sub && ai) out = await fromClaude(ai, d, focus!);
        if (!out) out = fromTemplate(templates, d, focus!);
        const push = toGender(out.push, g);
        const rec = toGender(out.rec, g);
        const card = cardFor(d, focus || "nolog", rec, d.hide);
        const { data: ok } = await db.rpc("day_summary_save", {
          p_secret: secret,
          p_profile: d.profile_id,
          p_kind: kind || (focus === "excellent" ? "excellent" : "summary"),
          p_push: push,
          p_card: card
        });
        if (ok) made++;
      })
    );
  }
  return made;
}
