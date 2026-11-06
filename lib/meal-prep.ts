// Meal prep: scale a recipe for N servings, split the cooked pot into boxes,
// and how long the boxes keep. Raw amounts are always the base; cooked weights
// are only used to divide the pot.

export type PrepIng = { n: string; a: number | string; u: string };
export type PrepMeal = { key: string; name: string; slot: string; cal: number; p: number; c: number; f: number; ingredients: PrepIng[]; prep: string; type?: string };

const TASTE = /حسب الذوق|رشة|عصرة/;
const COUNT_UNITS = /حب|شري|ملعق|كوب|فص|علب|ظرف|أصاب|شوت|وجه|رغيف|سكوب/;

/** Number in an amount ("2", "1.5", "٢") or null. */
export function amountNum(a: number | string): number | null {
  if (typeof a === "number") return Number.isFinite(a) ? a : null;
  const m = String(a).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
}

const fmt = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** One ingredient for N servings, as text: "1000 غ", "7.5 حبات", "حسب الذوق". */
export function scaledText(ing: PrepIng, servings: number) {
  const n = amountNum(ing.a);
  if (!n || TASTE.test(ing.u)) return ing.u && TASTE.test(ing.u) ? ing.u : "حسب الذوق";
  const v = n * servings;
  // grams and ml: whole numbers; pieces/spoons: halves kept
  const shown = COUNT_UNITS.test(ing.u) ? fmt(v) : String(Math.round(v));
  return `${shown} ${ing.u}`.trim();
}

/** Steps from "1. ... 2. ..." text. */
export function prepSteps(prep: string) {
  const t = (prep || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const parts = t.split(/(?:^|\s)\d{1,2}[.)-]\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

/** Swapped ingredients: the step text uses the new name, so it never mentions something not in the list. */
export function applySwapsToPrep(prep: string, swaps: { from: string; to: string }[]) {
  let out = prep;
  for (const s of swaps) {
    const toName = s.to.replace(/\s*\d+(?:[.,]\d+)?\s*(غ|جم|مل|حبة|حبات|كوب|ملعقة)?\s*$/, "").trim() || s.to;
    if (s.from && out.includes(s.from)) out = out.split(s.from).join(toName);
  }
  return out;
}

/** How long boxes keep (conservative food-safety numbers), by what's in the meal. */
export function storageFor(meal: Pick<PrepMeal, "name" | "slot" | "type" | "ingredients">): { fridge: number; freezer: number | null; tip: string } {
  const text = `${meal.name} ${meal.ingredients.map((i) => i.n).join(" ")}`;
  const kind = meal.type || "";
  if (kind === "سموذي" || /سموذي|عصير/.test(meal.name)) return { fridge: 1, freezer: 30, tip: "جمدي المكونات في أكياس لكل حصة، واخلطيها وقت الشرب." };
  if (kind === "سلطة" || /^سلطة/.test(meal.name)) return { fridge: 2, freezer: null, tip: "خلي الصوص لحاله وحطيه وقت الأكل عشان ما تذبل." };
  if (/سمك|تونة|سلمون|روبيان|جمبري|هامور|ربيان|سردين/.test(text)) return { fridge: 2, freezer: 60, tip: "الأكل البحري يخلص أسرع، كليه أول." };
  if (kind === "شوربة" || /شوربة|شوربه/.test(meal.name)) return { fridge: 3, freezer: 90, tip: "بردي الشوربة قبل لا تقفلين العلب." };
  const fresh = /خس|خيار|جرجير|بقدونس طازج|طماطم طازجة|أفوكادو|افوكادو/.test(text);
  const dairy = /زبادي|لبن|لبنة|جبن كريمي|قشطة/.test(text);
  return {
    fridge: 3,
    freezer: dairy || fresh ? null : 60,
    tip: fresh ? "الخضار الطازجة حطيها لحالها يوم الأكل." : dairy ? "الصوصات اللي فيها زبادي أو لبن ما تنفع للفريزر." : "بردي الأكل ساعة بالكثير قبل لا تدخلينه الثلاجة."
  };
}

export type Group = { label: string; portions: number; target: number | null };

/**
 * Each box's share of the pot. One person: equal. Different targets: by each
 * person's calorie target (a 2400 box gets 1.5× a 1600 box).
 */
export function boxShares(groups: Group[]): { group: number; share: number }[] {
  const weights = groups.map((g) => (groups.every((x) => x.target) ? g.target! : 1));
  const total = groups.reduce((a, g, i) => a + g.portions * weights[i], 0);
  if (!total) return [];
  return groups.flatMap((g, gi) => Array.from({ length: g.portions }, () => ({ group: gi, share: weights[gi] / total })));
}

export const servingsOf = (groups: Group[]) => groups.reduce((a, g) => a + g.portions, 0);
