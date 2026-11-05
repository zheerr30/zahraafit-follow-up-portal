import type { Meal, MealPlanData } from "@/lib/plan-data";

/** Her swap for a plan meal: another day's meal, or an extra (snack/salad). */
export type MealRef = { d: number; m: number } | { e: "snacks" | "salads"; i: number };

export function resolve(plan: MealPlanData, ref: MealRef | undefined, d: number, m: number): Meal {
  if (ref && "e" in ref) return plan.extras[ref.e][ref.i] || plan.days[d].meals[m];
  if (ref && "d" in ref) return plan.days[ref.d]?.meals[ref.m] || plan.days[d].meals[m];
  return plan.days[d].meals[m];
}

/** A ticked key from daily_logs ("0-2", "x-snacks-1") → the meal she ate, with her swaps. */
export function planMealFor(plan: MealPlanData | null | undefined, swaps: Record<string, MealRef> | undefined, key: string): Meal | null {
  if (!plan) return null;
  const x = key.match(/^x-(snacks|salads)-(\d+)$/);
  if (x) {
    const m = plan.extras[x[1] as "snacks" | "salads"]?.[Number(x[2])];
    return m ? { ...m, slot: "سناك" } : null;
  }
  const dm = key.match(/^(\d+)-(\d+)$/);
  if (!dm) return null;
  const d = Number(dm[1]);
  const m = Number(dm[2]);
  if (!plan.days[d]?.meals[m]) return null;
  return { ...resolve(plan, swaps?.[key], d, m), slot: plan.days[d].meals[m].slot };
}

/** Meals she ticked in a day's log. */
export function tickedMeals(plan: MealPlanData | null | undefined, swaps: Record<string, MealRef> | undefined, meals: Record<string, unknown> | null | undefined) {
  const out: { key: string; meal: Meal }[] = [];
  Object.entries(meals || {}).forEach(([k, v]) => {
    if (v !== true) return;
    const meal = planMealFor(plan, swaps, k);
    if (meal) out.push({ key: k, meal });
  });
  return out;
}
