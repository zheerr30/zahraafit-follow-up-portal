import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// «🤖 توليد بالذكاء الاصطناعي» inside the coach's workout generator
// (generators/workout.html calls POST /api/generate). Coach only: the platform
// adds her session token to the generator's request (FILL_WORKOUT_SCRIPT).
// Returns { plan: [{ title, exerciseIds[], prescriptions[{sets, reps}] }] }, the
// shape her generator expects; it only picks from the exercises it was sent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const err = (status: number, error: string) => Response.json({ error }, { status });

type Avail = { id: string; name: string; group: string; muscle: string; level: number; fav?: boolean };
type Body = {
  client?: { name?: string; age?: string; gender?: string; weight?: string; height?: string };
  env?: string; level?: number; days?: number; split?: string; dailyCount?: number; conditions?: string[];
  goal?: string; aiRequest?: string; available?: Avail[]; minDaily?: number; maxDaily?: number;
  weeklyTargets?: Record<string, number>; gluteEmphasis?: boolean;
};

const SCHEMA = {
  type: "object",
  properties: {
    plan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          exerciseIds: { type: "array", items: { type: "string" } },
          prescriptions: {
            type: "array",
            items: { type: "object", properties: { sets: { type: ["integer", "null"] }, reps: { type: ["string", "null"] } }, required: ["sets", "reps"], additionalProperties: false }
          }
        },
        required: ["title", "exerciseIds", "prescriptions"],
        additionalProperties: false
      }
    }
  },
  required: ["plan"],
  additionalProperties: false
};

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return err(401, "افتحي المولد من المنصة (صفحة الطلب) عشان يشتغل الذكاء الاصطناعي.");
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user } = await db.auth.getUser(token);
  if (!user.user) return err(401, "انتهت الجلسة. سجلي دخول مرة ثانية.");
  const { data: prof } = await db.from("profiles").select("role").eq("id", user.user.id).maybeSingle();
  if (prof?.role !== "admin") return err(403, "للمدربة بس.");
  if (!process.env.ANTHROPIC_API_KEY) return err(503, "مفتاح الذكاء الاصطناعي مو مضاف في Vercel.");

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return err(400, "طلب غير صالح");
  }
  const available = (Array.isArray(b.available) ? b.available : []).filter((e) => e && typeof e.id === "string").slice(0, 400);
  if (!available.length) return err(400, "ما فيه تمارين متاحة بهالإعدادات");
  const days = Math.max(1, Math.min(7, Number(b.days) || 4));
  const minD = Math.max(1, Number(b.minDaily) || 4), maxD = Math.max(minD, Math.min(12, Number(b.maxDaily) || 8));
  const ids = new Set(available.map((e) => e.id));

  const prompt = [
    "You build a weekly gym plan for a subscriber of ZahraaFit, a Saudi women's fitness coach. Use ONLY exercise ids from the list below.",
    `Client: ${JSON.stringify({ gender: b.client?.gender, age: b.client?.age, weight: b.client?.weight, height: b.client?.height })}`,
    `Place: ${b.env}. Level (1 beginner – 3 advanced): ${b.level}. Training days per week: exactly ${days}. Preferred split system: ${b.split || "any sensible split"}.`,
    `Goal: ${b.goal}. Health conditions to protect (exercises risky for them were already removed): ${(b.conditions || []).join(", ") || "none"}.`,
    `Exercises per day: between ${minD} and ${maxD}${b.dailyCount ? ` (aim for about ${b.dailyCount})` : ""}.`,
    `Weekly working-set targets per muscle (aim close to these across the week): ${JSON.stringify(b.weeklyTargets || {})}.`,
    b.gluteEmphasis ? "Give the glutes priority (she wants more glute work)." : "",
    "Rules: compound movements before isolation in each day, core/abs last. Spread each muscle over the week sensibly (big muscles about twice a week when days allow). Don't repeat the same exercise twice in one day. Prefer exercises marked fav:true.",
    "Day titles in Arabic listing the muscles of the day, e.g. «صدر + أكتاف + ترايسبس».",
    "prescriptions: one entry per exercise in the same order. Leave sets and reps null unless the coach's request below asks for specific numbers.",
    b.aiRequest?.trim() ? `The coach's own request (highest priority, follow it exactly, it may be in Arabic):\n<coach_request>\n${b.aiRequest.trim().slice(0, 3000)}\n</coach_request>` : "",
    `Available exercises (id, name, group, muscle, level, fav):\n${available.map((e) => `${e.id} | ${e.name} | ${e.group} | ${e.muscle} | ${e.level}${e.fav ? " | fav" : ""}`).join("\n")}`
  ].filter(Boolean).join("\n\n");

  const ai = new Anthropic();
  try {
    const res = await ai.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }]
    });
    if (res.stop_reason === "refusal") return err(422, "الذكاء الاصطناعي رفض الطلب، جربي تعدلين نص الطلب.");
    const text = res.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") return err(502, "ما وصلنا رد من الذكاء الاصطناعي");
    const out = JSON.parse(text.text) as { plan: { title: string; exerciseIds: string[]; prescriptions: { sets: number | null; reps: string | null }[] }[] };
    // Only exercises she sent, each once a day; keep the matching prescription.
    const plan = (out.plan || []).slice(0, days).map((d) => {
      const seen = new Set<string>();
      const keep: number[] = [];
      d.exerciseIds.forEach((id, i) => {
        if (ids.has(id) && !seen.has(id)) {
          seen.add(id);
          keep.push(i);
        }
      });
      return {
        title: String(d.title || "").slice(0, 80),
        exerciseIds: keep.map((i) => d.exerciseIds[i]).slice(0, maxD),
        prescriptions: keep.map((i) => d.prescriptions?.[i] || { sets: null, reps: null }).slice(0, maxD)
      };
    }).filter((d) => d.exerciseIds.length);
    if (!plan.length) return err(502, "الذكاء ما طلع جدول صالح");
    return Response.json({ plan });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return err(429, "الخدمة مشغولة، جربي بعد دقيقة.");
    if (e instanceof Anthropic.AuthenticationError) return err(503, "مفتاح الذكاء الاصطناعي غير صحيح.");
    return err(502, "تعذر الاتصال بالذكاء الاصطناعي");
  }
}
