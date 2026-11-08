"use client";

import { useEffect, useState } from "react";
import { loadBase } from "@/lib/base-foods";
import type { BaseFood } from "@/lib/foods";
import type { Meal } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

// «تفاصيل أكثر» in the calorie card: fiber, sodium, potassium and sugar for the day.
// Values come from the food list (USDA data per ingredient, lib/micro-data.ts).
// Plan meals are worked out from their raw ingredients; anything without full data
// is counted so the card can say how many items are missing.

export type Micro = { fib: number | null; na: number | null; k: number | null; sug: number | null; /** some parts had no data (the rest is still added) */ partial?: boolean };
export type DayMicros = { fib: number; na: number; k: number; sug: number; missing: number; items: number };

const TASTE = /حسب الذوق|رشة|عصرة/;
const n = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

/** Grams of one plan ingredient, or null if it can't be told. */
function gramsOf(ing: { a: number | string; u: string }, base: BaseFood | undefined) {
  const a = typeof ing.a === "number" ? ing.a : Number(String(ing.a).match(/\d+(?:\.\d+)?/)?.[0]);
  if (!a || !Number.isFinite(a)) return null;
  if (/^(غ|جم|جرام|غرام|مل|g)$/i.test(ing.u.trim())) return a;
  if (base?.piece) return a * base.piece.g;
  return null;
}

/** A plan meal's values from its raw ingredients; ingredients without data are skipped and the meal is marked partial. */
export function mealMicros(meal: Pick<Meal, "ingredients">, base: BaseFood[]): Micro {
  const byName = new Map(base.map((b) => [n(b.n), b]));
  const out = { fib: 0, na: 0, k: 0, sug: 0 };
  let partial = false;
  for (const ing of meal.ingredients) {
    if (TASTE.test(ing.u) || ing.a === 0 || ing.a === "") continue;
    const b = byName.get(n(ing.n));
    const g = gramsOf(ing, b);
    for (const key of ["fib", "na", "k", "sug"] as const) {
      const v = b?.m?.[key];
      if (g === null || v === null || v === undefined) partial = true;
      else out[key] += (v * g) / 100;
    }
  }
  return { ...out, partial };
}

/** Adds up the day; items with any value missing are counted, the rest still adds up. */
export function sumMicros(list: Micro[]): DayMicros {
  const t: DayMicros = { fib: 0, na: 0, k: 0, sug: 0, missing: 0, items: list.length };
  for (const m of list) {
    if (m.partial || m.fib === null || m.na === null || m.k === null || m.sug === null) t.missing++;
    t.fib += m.fib || 0;
    t.na += m.na || 0;
    t.k += m.k || 0;
    t.sug += m.sug || 0;
  }
  return t;
}

/** The day's details: logged food (stored values) + ticked plan meals (from their ingredients). */
export function useDayMicros(clientId: string | null | undefined, date: string, meals: Pick<Meal, "ingredients">[], refresh = 0) {
  const [out, setOut] = useState<DayMicros | null>(null);
  const key = JSON.stringify(meals.map((m) => m.ingredients));
  useEffect(() => {
    if (!clientId) return;
    let off = false;
    (async () => {
      const [base, { data }] = await Promise.all([
        loadBase(),
        supabase.from("food_entries").select("*").eq("client_id", clientId).eq("log_date", date)
      ]);
      const entries = ((data as { fiber?: number | null; sodium?: number | null; potassium?: number | null; sugar?: number | null }[] | null) || []).map((e) => ({
        fib: e.fiber ?? null, na: e.sodium ?? null, k: e.potassium ?? null, sug: e.sugar ?? null
      }));
      const planned = (JSON.parse(key) as Meal["ingredients"][]).map((ingredients) => mealMicros({ ingredients }, base));
      if (!off) setOut(sumMicros([...entries, ...planned]));
    })();
    return () => {
      off = true;
    };
  }, [clientId, date, key, refresh]);
  return out;
}
