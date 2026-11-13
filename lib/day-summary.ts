// End-of-day summary (phase22-day-summary.sql): which gap to talk about, the coach's
// ready sentences for free accounts, and the «ملخص يومك» card data.
// No browser code here: the server (push) and the home card both use it.

export type DayNumbers = {
  cal: number; p: number; c: number; f: number;
  target_cal: number | null; target_p: number | null;
  water: number; water_goal: number | null;
  meals_done: number; meals_total: number;
};

/** What the summary talks about, in the coach's order: protein, calories (±15%), water, skipped meals. */
export type Focus = "protein" | "cal_low" | "cal_high" | "water" | "meals" | "excellent";
export type TemplateKey = Focus | "nolog";
export type Template = { push: string; plain: string; rec: string };
export type Templates = Record<TemplateKey, Template>;

export const TEMPLATE_KEYS: { key: TemplateKey; label: string }[] = [
  { key: "protein", label: "البروتين أقل من ٨٥٪ من الهدف" },
  { key: "cal_low", label: "السعرات أقل من الهدف بأكثر من ١٥٪" },
  { key: "cal_high", label: "السعرات أكثر من الهدف بأكثر من ١٥٪" },
  { key: "water", label: "الماء أقل من ٨٥٪" },
  { key: "meals", label: "فاتتها وجبات من خطتها" },
  { key: "excellent", label: "يوم ممتاز (كل شي فوق ٨٥٪)" },
  { key: "nolog", label: "ما سجلت أكلها (مرة، وما يتكرر يومين ورا بعض)" }
];

export const DEFAULT_TEMPLATES: Templates = {
  protein: { push: "بروتينك اليوم {p} من {p_goal} جرام. بكرا زيدي مصدر بروتين في الفطور", plain: "بروتينك اليوم أقل من هدفك. بكرا زيدي مصدر بروتين في الفطور", rec: "بكرا ابدئي فطورك ببروتين واضح مثل البيض أو الزبادي اليوناني، وكملي الباقي على الغداء." },
  cal_low: { push: "أكلتي اليوم {cal} من {cal_goal} سعرة. بكرا لا تطولين بين الوجبات", plain: "أكلك اليوم أقل من هدفك بوضوح. بكرا لا تطولين بين الوجبات", rec: "بكرا جهزي سناك من الحين وخذيه معك، عشان ما يمر وقت طويل بدون أكل." },
  cal_high: { push: "أكلتي اليوم {cal} من {cal_goal} سعرة. عادي، بكرا ارجعي لخطتك", plain: "زدتي اليوم عن هدفك. عادي، بكرا ارجعي لخطتك", rec: "بكرا سجلي أكلك أول بأول، واختاري سناك خفيف لو جعتي بالليل." },
  water: { push: "شربتي {water} من {water_goal} أكواب ماء. بكرا خلي القارورة قدامك", plain: "شربك للماء اليوم قليل. بكرا خلي القارورة قدامك", rec: "بكرا اشربي كوب ماء مع كل وجبة، وخلي القارورة قدامك طول اليوم." },
  meals: { push: "فاتك اليوم {meals_left} وجبة من خطتك. بكرا جهزيها من الصبح", plain: "فاتتك وجبات من خطتك اليوم. بكرا جهزيها من الصبح", rec: "بكرا جهزي وجباتك من الصبح، وعلمي عليها أول بأول." },
  excellent: { push: "يومك اليوم ممتاز: بروتين وسعرات وماء على الهدف. كذا نبيه", plain: "يومك اليوم ممتاز: بروتين وسعرات وماء على الهدف. كذا نبيه", rec: "" },
  nolog: { push: "ما سجلتي أكلك اليوم، باقي وقت", plain: "ما سجلتي أكلك اليوم، باقي وقت", rec: "" }
};

export const PUSH_MAX = 90;
const DEFAULT_WATER = 8;

const ratio = (v: number, goal: number | null | undefined) => (goal && goal > 0 ? v / goal : null);

export function focusOf(d: DayNumbers): Focus {
  const p = ratio(d.p, d.target_p);
  if (p !== null && p < 0.85) return "protein";
  const cal = ratio(d.cal, d.target_cal);
  if (cal !== null && cal < 0.85) return "cal_low";
  if (cal !== null && cal > 1.15) return "cal_high";
  if ((ratio(d.water, d.water_goal || DEFAULT_WATER) ?? 1) < 0.85) return "water";
  if (d.meals_total > 0 && d.meals_done / d.meals_total < 0.85) return "meals";
  return "excellent";
}

/** The card's three lines (0..1+), and the plate split by calories from protein, carbs, fat. */
export type SummaryCard = {
  focus: Focus | "nolog";
  hide: boolean;
  rec: string;
  /** قوة = protein, توازن = calories near the goal, بساطة = water and plan meals. null = no goal. */
  strength: number | null;
  balance: number | null;
  simple: number | null;
  plate: { p: number; c: number; f: number } | null;
  nums: { cal: number; p: number; target_cal: number | null; target_p: number | null; water: number; water_goal: number } | null;
};

export function cardFor(d: DayNumbers, focus: Focus | "nolog", rec: string, hide: boolean): SummaryCard {
  const cal = ratio(d.cal, d.target_cal);
  const water = ratio(d.water, d.water_goal || DEFAULT_WATER) ?? 0;
  const meals = d.meals_total > 0 ? d.meals_done / d.meals_total : null;
  const kcal = d.p * 4 + d.c * 4 + d.f * 9;
  const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
  return {
    focus,
    hide,
    rec,
    strength: r2(ratio(d.p, d.target_p)),
    // 1 = right on the goal; going over counts down like going under.
    balance: cal === null ? null : r2(Math.max(0, 1 - Math.abs(1 - cal))),
    simple: r2(meals === null ? Math.min(1, water) : (Math.min(1, water) + Math.min(1, meals)) / 2),
    plate: kcal > 0 ? { p: Math.round((d.p * 4 * 100) / kcal), c: Math.round((d.c * 4 * 100) / kcal), f: Math.round((d.f * 9 * 100) / kcal) } : null,
    nums: hide ? null : { cal: Math.round(d.cal), p: Math.round(d.p), target_cal: d.target_cal, target_p: d.target_p, water: d.water, water_goal: d.water_goal || DEFAULT_WATER }
  };
}

/** A coach sentence with the numbers filled in. */
export function fillTemplate(text: string, d: DayNumbers) {
  const n = (x: number | null | undefined) => (x === null || x === undefined ? "" : Math.round(x).toLocaleString("en-US"));
  return text
    .replace(/\{p\}/g, n(d.p))
    .replace(/\{p_goal\}/g, n(d.target_p))
    .replace(/\{cal\}/g, n(d.cal))
    .replace(/\{cal_goal\}/g, n(d.target_cal))
    .replace(/\{water\}/g, n(d.water))
    .replace(/\{water_goal\}/g, n(d.water_goal || DEFAULT_WATER))
    .replace(/\{meals_left\}/g, n(Math.max(0, d.meals_total - d.meals_done)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Coach's saved sentences on top of the defaults (an empty field keeps the default). */
export function mergeTemplates(saved: unknown): Templates {
  const out = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)) as Templates;
  if (!saved || typeof saved !== "object") return out;
  for (const { key } of TEMPLATE_KEYS) {
    const t = (saved as Record<string, Partial<Template> | undefined>)[key];
    if (!t) continue;
    for (const f of ["push", "plain", "rec"] as const) if (typeof t[f] === "string" && t[f]!.trim()) out[key][f] = t[f]!.trim();
  }
  return out;
}

/** No emoji, no shadda/tanween, no exclamation marks, one line. */
export function cleanLine(s: string) {
  return s
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/[ًّ]/g, "")
    .replace(/[!！]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
