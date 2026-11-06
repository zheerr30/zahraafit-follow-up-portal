import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// Friday recommendations: 2–3 short tips from this person's own week.
// The phone sends the week's numbers (the same ones shown on the Friday card);
// the person's gender, "hide numbers" choice and the coach's latest note are read here.
// One set per person per week (public.save_weekly_recs in phase18-weekly-recs.sql).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const err = (status: number, code: string) => Response.json({ error: code }, { status });

const FIELDS = ["daysLogged", "committed", "avgCal", "avgP", "avgC", "avgF", "targetCal", "targetP", "targetC", "targetF", "water", "waterGoal", "mealsPlanned", "mealsEaten", "outside", "workouts", "workoutDays", "weightChange", "periodDays"] as const;
type Week = Record<(typeof FIELDS)[number], number | null>;

function cleanWeek(raw: unknown): Week {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const w = {} as Week;
  for (const k of FIELDS) {
    const n = Number(o[k]);
    w[k] = o[k] === null || o[k] === undefined || !Number.isFinite(n) || Math.abs(n) > 100000 ? null : Math.round(n * 10) / 10;
  }
  return w;
}

function riyadhToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

const SCHEMA = {
  type: "object",
  properties: { recs: { type: "array", items: { type: "string" } } },
  required: ["recs"],
  additionalProperties: false
};

function prompt(week: Week, male: boolean, hide: boolean, coachNote: string | null) {
  const few = (week.daysLogged || 0) < 3;
  const rules = [
    `You write the weekly recommendations for a subscriber of ZahraaFit, a Saudi fitness coach's app. The subscriber is ${male ? "a man: address him in the masculine" : "a woman: address her in the feminine"}.`,
    "Write in direct, warm Saudi dialect (e.g. «زيدي البروتين في الفطور», «حلو التزامك بالماء»). No emoji, no shadda (ّ), no greetings or sign-offs.",
    few
      ? "This week fewer than 3 days were logged, so return exactly ONE recommendation: encourage continuing to log food every day so next week's tips can be specific. Nothing else."
      : "Return 2 or 3 recommendations. The first one starts with something done well this week (a real point from the data), then the next ones say what to improve and how, practically.",
    "Each recommendation is 1 or 2 short sentences, specific to THIS week's data below, never generic.",
    "Allowed topics only: protein, water, how meals are spread across the day, sticking to the plan's meals, eating outside the plan, workouts, sleep.",
    "Forbidden: changing the calorie or macro targets, editing or replacing the plan, any diagnosis or medical talk, medicines or supplements. No blame and no exaggerated praise.",
    hide
      ? "This person chose not to see numbers: do NOT write any number of calories, grams, macros or kilograms, and no percentages. Speak in words only (e.g. «أقل من هدفك بشوي»)."
      : "You may mention a number from the data when it helps (e.g. average protein vs target).",
    (week.periodDays || 0) > 0
      ? "This week included period days: if weight is mentioned, say a change in these days is normal (water retention) and build NO recommendation on the weight change."
      : "",
    coachNote ? `The coach's latest note to this subscriber is below. Never contradict it; you can support it.\n<coach_note>\n${coachNote.slice(0, 1500)}\n</coach_note>` : "",
    "Use only the data given. A null value means not logged: don't guess it. If targets are null, don't compare to a target.",
    `This week's data (last 7 days):\n${JSON.stringify(week)}`,
    "Field meanings: daysLogged = days with any log; committed = days with food logged; avg* = average per logged day (calories, protein g, carbs g, fat g); target* = daily targets; water = average cups per day; waterGoal = cups per day goal; mealsPlanned/mealsEaten = plan meals on logged days vs ticked as eaten; outside = times food was logged outside the plan; workouts = workout days; workoutDays = workout days in the plan per week; weightChange = kg change over the last two weeks (period days excluded); periodDays = days of period this week."
  ];
  return rules.filter(Boolean).join("\n\n");
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return err(401, "signin");
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user } = await db.auth.getUser(token);
  if (!user.user) return err(401, "signin");

  const today = riyadhToday();
  if (new Date(today + "T12:00:00Z").getUTCDay() !== 5) return err(400, "not_friday");

  const { data: existing, error: exErr } = await db.from("weekly_recs").select("recs, status").eq("profile_id", user.user.id).eq("week_end", today).maybeSingle();
  if (exErr) return err(503, "not_configured");
  if (existing) return Response.json(existing);

  if (!process.env.ANTHROPIC_API_KEY) return err(503, "not_configured");

  let week: Week;
  try {
    week = cleanWeek(((await req.json()) as { week?: unknown }).week);
  } catch {
    return err(400, "bad_week");
  }

  const { data: prof } = await db.from("profiles").select("gender, hide_numbers").eq("id", user.user.id).maybeSingle();
  const { data: client } = await db.from("clients").select("id").eq("profile_id", user.user.id).maybeSingle();
  let coachNote: string | null = null;
  if (client) {
    const [{ data: f }, { data: p }] = await Promise.all([
      db.from("weekly_followups").select("coach_notes, coach_replied_at, week_date").eq("client_id", client.id).not("coach_notes", "is", null).order("week_date", { ascending: false }).limit(1).maybeSingle(),
      db.from("plans").select("data").eq("client_id", client.id).eq("kind", "nutrition").eq("is_current", true).limit(1).maybeSingle()
    ]);
    const planNote = (p?.data as { coachNote?: string } | null)?.coachNote || null;
    coachNote = [f?.coach_notes, planNote].filter(Boolean).join("\n---\n") || null;
  }
  const male = prof?.gender === "male";
  const hide = Boolean(prof?.hide_numbers);
  const few = (week.daysLogged || 0) < 3;

  const ai = new Anthropic();
  let recs: string[];
  try {
    const res = await ai.beta.messages.create({
      model: MODEL,
      max_tokens: 1500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt(week, male, hide, coachNote) }]
    });
    if (res.stop_reason === "refusal") return err(422, "refused");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return err(502, "no_answer");
    recs = ((JSON.parse(text.text) as { recs: unknown[] }).recs || [])
      .map((r) => String(r).replace(/ّ/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim())
      .filter((r) => r.length > 5 && r.length <= 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return err(429, "busy");
    if (e instanceof Anthropic.AuthenticationError) return err(503, "not_configured");
    return err(502, "failed");
  }
  if (hide) recs = recs.filter((r) => !/[0-9٠-٩]/.test(r));
  recs = recs.slice(0, few ? 1 : 3);
  if (!recs.length) return err(502, "no_answer");

  const { data: status, error: saveErr } = await db.rpc("save_weekly_recs", { p_week: today, p_recs: recs });
  if (saveErr) return err(503, "not_configured");
  return Response.json({ recs, status });
}
