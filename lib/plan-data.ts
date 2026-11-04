// Plan data as the generator buttons export it (see lib/bookmarklets.ts).

export type Ingredient = { n: string; a: number | string; u: string };
export type Sub = { for: string; options: string[] };
export type Meal = {
  slot: string;
  name: string;
  cal: number;
  p: number;
  c: number;
  f: number;
  ingredients: Ingredient[];
  prep: string;
  subs: Sub[];
  note: string;
};
export type MealPlanData = {
  format: "zahraafit-meal-plan";
  v: number;
  name: string;
  date?: string;
  target: { cal: number; p: number; c: number; f: number };
  days: { n: number; meals: Meal[] }[];
  extras: { snacks: Meal[]; salads: Meal[] };
};

export type Exercise = {
  id: string;
  name: string;
  en: string;
  muscle: string;
  sets: number;
  reps: string;
  rest: string;
  tip: string;
  video: string;
  alt: { name: string; video: string } | null;
};
export type WorkoutPlanData = {
  format: "zahraafit-workout-plan";
  v: number;
  name: string;
  env: string;
  days: { n: number; title: string; exercises: Exercise[] }[];
};

export type ParsedPlan =
  | { kind: "nutrition"; title: string; data: MealPlanData; doc?: PlanDoc }
  | { kind: "workout"; title: string; data: WorkoutPlanData; doc?: PlanDoc };

/** A plan's designed document (the generator's own file), saved next to the plan data (see lib/doc-pack.ts). */
export type PlanDoc = { format: string; html?: string; gz?: string };

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));
const num = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function cleanMeal(m: Partial<Meal>): Meal {
  return {
    slot: str(m.slot),
    name: str(m.name),
    cal: Math.round(num(m.cal)),
    p: num(m.p),
    c: num(m.c),
    f: num(m.f),
    ingredients: arr<Ingredient>(m.ingredients).map((i) => ({ n: str(i.n), a: typeof i.a === "number" ? i.a : str(i.a), u: str(i.u) })),
    prep: str(m.prep),
    subs: arr<Sub>(m.subs).map((s) => ({ for: str(s.for), options: arr<string>(s.options).map(str) })),
    note: str(m.note)
  };
}

/** Reads an exported file. Throws an Arabic message the coach can act on. */
export function parsePlanFile(text: string): ParsedPlan {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("الملف هذا مو ملف بيانات خطة. نزّليه من زر «تصدير» في شريط المفضلة.");
  }
  if (raw.format === "zahraafit-meal-plan") {
    const days = arr<{ n: number; meals: Partial<Meal>[] }>(raw.days).map((d, i) => ({ n: num(d.n) || i + 1, meals: arr<Partial<Meal>>(d.meals).map(cleanMeal) }));
    if (!days.length || !days.some((d) => d.meals.length)) throw new Error("ملف الجدول الغذائي فاضي.");
    const t = (raw.target || {}) as Record<string, unknown>;
    const ex = (raw.extras || {}) as Record<string, unknown>;
    return {
      kind: "nutrition",
      title: "الجدول الغذائي",
      data: {
        format: "zahraafit-meal-plan",
        v: num(raw.v) || 1,
        name: str(raw.name),
        target: { cal: num(t.cal), p: num(t.p), c: num(t.c), f: num(t.f) },
        days,
        extras: { snacks: arr<Partial<Meal>>(ex.snacks).map(cleanMeal), salads: arr<Partial<Meal>>(ex.salads).map(cleanMeal) }
      }
    };
  }
  if (raw.format === "zahraafit-workout-plan") {
    const days = arr<{ n: number; title: string; exercises: Partial<Exercise>[] }>(raw.days).map((d, i) => ({
      n: num(d.n) || i + 1,
      title: str(d.title) || `اليوم ${i + 1}`,
      exercises: arr<Partial<Exercise>>(d.exercises).map((e) => ({
        id: str(e.id),
        name: str(e.name),
        en: str(e.en),
        muscle: str(e.muscle),
        sets: Math.max(1, Math.min(10, Math.round(num(e.sets) || 3))),
        reps: str(e.reps) || "10-12",
        rest: str(e.rest) || "60-90 ث",
        tip: str(e.tip),
        video: /^https:\/\//.test(str(e.video)) ? str(e.video) : "",
        alt: e.alt && typeof e.alt === "object" ? { name: str(e.alt.name), video: /^https:\/\//.test(str(e.alt.video)) ? str(e.alt.video) : "" } : null
      }))
    }));
    if (!days.length || !days.some((d) => d.exercises.length)) throw new Error("ملف الجدول الرياضي فاضي.");
    return { kind: "workout", title: "الجدول الرياضي", data: { format: "zahraafit-workout-plan", v: num(raw.v) || 1, name: str(raw.name), env: str(raw.env), days } };
  }
  throw new Error("الملف هذا مو ملف بيانات خطة. نزّليه من زر «تصدير» في شريط المفضلة.");
}

/** "10-12" → [10, 12]; "15" → [15, 15]. */
export function repRange(reps: string): [number, number] {
  const nums = (reps.match(/\d+/g) || []).map(Number);
  if (!nums.length) return [10, 12];
  return [Math.min(...nums), Math.max(...nums)];
}

/** "90-120 ث" → 90 seconds; "2 د" → 120. */
export function restSeconds(rest: string): number {
  const n = Number((rest.match(/\d+/) || ["60"])[0]);
  return /د|min/.test(rest) && !/ث/.test(rest) ? n * 60 : n;
}

export function ingredientText(i: Ingredient) {
  if (i.u === "حسب الذوق" || i.a === 0 || i.a === "") return `${i.n} · حسب الذوق`;
  return `${i.n} · ${i.a} ${i.u}`;
}

const MUSCLE_IMG = new Set(["chest", "upperback", "midback", "frontdelt", "reardelt", "sidedelt", "biceps", "triceps", "absfront", "absside", "quads", "adductors", "hamstrings", "glutes", "calves"]);
/** Muscle picture from the workout generator's public images. */
export function muscleImage(muscle: string) {
  const m = muscle === "lats" ? "upperback" : muscle;
  return MUSCLE_IMG.has(m) ? `https://zahraafit.vercel.app/img/${m}.png` : null;
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
