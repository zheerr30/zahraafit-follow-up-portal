import { norm, type BaseFood } from "@/lib/foods";
import type { Ingredient } from "@/lib/plan-data";

const GRAM_UNITS = /^(g|غ|جم|جرام|غرام|مل|ml)$/i;

export type SwapOption = { label: string; name: string; grams: number; cal: number; p: number; c: number; f: number };

const stateOf = (n: string) => (/نيء|نيئة/.test(n) ? "raw" : /مطبوخ|مسلوق|مشوي/.test(n) ? "cooked" : "");
const opposite = (st: string) => (st === "raw" ? "cooked" : st === "cooked" ? "raw" : "none");
const stem = (n: string) => norm(n).replace(/\s*(نيء|نيئه|مطبوخ|مطبوخه|مسلوق|مشوي)\s*/g, " ").trim();
/** The same food in another state (raw/cooked) isn't a real alternative. */
const sameFood = (a: string, b: string) => stem(a) === stem(b);

/** The base food an ingredient refers to (exact name first, then the closest name). */
export function baseFor(ing: Ingredient, base: BaseFood[]) {
  const n = norm(ing.n);
  return base.find((b) => norm(b.n) === n) || base.filter((b) => n.includes(norm(b.n)) || norm(b.n).includes(n)).sort((a, b) => b.n.length - a.n.length)[0] || null;
}

/** Grams of the ingredient in the plan, if it can be worked out. */
export function gramsOf(ing: Ingredient, b: BaseFood) {
  if (typeof ing.a !== "number" || ing.a <= 0) return null;
  if (GRAM_UNITS.test(ing.u.trim())) return ing.a;
  if (b.piece && /حب|شريح|رغيف|وجه|ملعق|سكوب/.test(ing.u)) return ing.a * b.piece.g;
  return null;
}

/**
 * «ما عندي هذا»: same-group foods with a similar macro mix, sized to the same calories
 * (vegetables and very light foods keep the same weight).
 */
export function smartSwaps(ing: Ingredient, base: BaseFood[], limit = 5): SwapOption[] {
  const b = baseFor(ing, base);
  if (!b || !b.cal) return [];
  const g = gramsOf(ing, b);
  if (!g) return [];
  const kcal = (b.cal * g) / 100;
  const mix = (x: BaseFood) => [(x.p * 4) / x.cal, (x.c * 4) / x.cal, (x.f * 9) / x.cal];
  const [p0, c0, f0] = mix(b);
  return base
    .filter((x) => x.n !== b.n && x.cal > 0 && x.cat === b.cat && !sameFood(b.n, x.n) && stateOf(x.n) !== opposite(stateOf(b.n)))
    .map((x) => {
      const [p1, c1, f1] = mix(x);
      const grams = b.cal < 40 ? g : Math.min(600, Math.max(5, (kcal / x.cal) * 100));
      const r5 = Math.max(5, Math.round(grams / 5) * 5);
      const k = r5 / 100;
      return { x, d: Math.abs(p0 - p1) + Math.abs(c0 - c1) + Math.abs(f0 - f1), grams: r5, cal: Math.round(x.cal * k), p: Math.round(x.p * k), c: Math.round(x.c * k), f: Math.round(x.f * k) };
    })
    .sort((a, z) => a.d - z.d)
    .slice(0, limit)
    .map((o) => ({ label: `${o.x.n} ${o.grams}جم`, name: o.x.n, grams: o.grams, cal: o.cal, p: o.p, c: o.c, f: o.f }));
}
