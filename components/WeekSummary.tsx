"use client";

import { useEffect, useState } from "react";
import { todayKey, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";
import { inPeriod, type PeriodLog } from "@/lib/period";
import { tickedMeals } from "@/lib/meal-resolve";
import { ShareSheet } from "@/components/ShareSheet";

type Stats = { mealPct: number | null; days: number; committed: number; avgCal: number | null; avgP: number | null; water: number; workouts: number; steps: number | null; weight: number | null; off: number };

function dayKeys(n: number) {
  const t = new Date(todayKey() + "T12:00:00");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(t);
    d.setDate(t.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

function headline(s: Stats) {
  if (s.mealPct !== null && s.mealPct >= 85) return "🌟 أسبوع بطل! التزامك يفرق، كملي كذا";
  if (s.mealPct !== null && s.mealPct >= 65) return "👏 أسبوع حلو، شوي بس وتوصلين للقمة";
  if (s.days >= 4) return "💪 كل يوم تسجلين فيه خطوة، الأسبوع الجاي نرفع الالتزام";
  return "🌱 بداية! سجلي أكلك وماك كل يوم وبتشوفين الفرق";
}

/** "Your week" on the home screen: last 7 days at a glance. Hidden until she has logged at least two days. */
export function WeekSummary({ clientId, plans }: { clientId: string; plans: Plan[] }) {
  const [s, setS] = useState<Stats | null>(null);
  const [share, setShare] = useState(false);
  const meal = plans.find((p) => p.kind === "nutrition" && p.data)?.data as MealPlanData | undefined;
  const perDay = meal?.days[0]?.meals.length || 0;

  useEffect(() => {
    const days = dayKeys(7);
    (async () => {
      const [{ data: d }, { data: w }, { data: b }, { data: pl }, { data: fe }] = await Promise.all([
        supabase.from("daily_logs").select("log_date, meals, water").eq("client_id", clientId).gte("log_date", days[6]),
        supabase.from("workout_logs").select("performed_on").eq("client_id", clientId).gte("performed_on", days[6]),
        supabase.from("body_logs").select("log_date, weight_kg").eq("client_id", clientId).not("weight_kg", "is", null).gte("log_date", dayKeys(14)[13]).order("log_date", { ascending: true }),
        supabase.from("period_logs").select("*").eq("client_id", clientId).order("start_date", { ascending: false }).limit(3),
        supabase.from("food_entries").select("log_date, cal, p").eq("client_id", clientId).gte("log_date", days[6])
      ]);
      // Calories and protein per day: ticked plan meals + logged food.
      const perDayTotals = new Map<string, { cal: number; p: number }>();
      const bump = (day: string, cal: number, p: number) => { const t = perDayTotals.get(day) || { cal: 0, p: 0 }; perDayTotals.set(day, { cal: t.cal + cal, p: t.p + p }); };
      ((d as { log_date: string; meals: Record<string, unknown> }[] | null) || []).forEach((x) => tickedMeals(meal || null, {}, x.meals).forEach((t) => bump(x.log_date, t.meal.cal, t.meal.p)));
      ((fe as { log_date: string; cal: number; p: number }[] | null) || []).forEach((x) => bump(x.log_date, Number(x.cal), Number(x.p)));
      const counted = Array.from(perDayTotals.values()).filter((t) => t.cal > 0);
      const periods = (pl as PeriodLog[] | null) || [];
      const logs = (d as { log_date: string; meals: Record<string, unknown>; water: number }[] | null) || [];
      const eaten = logs.reduce((a, x) => a + Object.entries(x.meals || {}).filter(([k, v]) => /^\d+-\d+$/.test(k) && v === true).length, 0);
      const steps = logs.map((x) => Number((x.meals?._day as { steps?: string } | undefined)?.steps?.replace(/\D/g, "")) || 0).filter(Boolean);
      const off = logs.reduce((a, x) => a + (Array.isArray(x.meals?._off) ? (x.meals._off as unknown[]).length : 0), 0);
      // Period-day weights don't count toward the change.
      const ws = ((b as { log_date: string; weight_kg: number }[] | null) || []).filter((x) => !inPeriod(periods, x.log_date)).map((x) => Number(x.weight_kg));
      setS({
        mealPct: perDay ? Math.min(100, Math.round((eaten / (perDay * 7)) * 100)) : null,
        days: logs.length,
        committed: counted.length,
        avgCal: counted.length ? Math.round(counted.reduce((a, t) => a + t.cal, 0) / counted.length) : null,
        avgP: counted.length ? Math.round(counted.reduce((a, t) => a + t.p, 0) / counted.length) : null,
        water: logs.length ? Math.round((logs.reduce((a, x) => a + (x.water || 0), 0) / logs.length) * 10) / 10 : 0,
        workouts: new Set(((w as { performed_on: string }[] | null) || []).map((x) => x.performed_on)).size,
        steps: steps.length ? Math.round(steps.reduce((a, x) => a + x, 0) / steps.length) : null,
        weight: ws.length > 1 ? Math.round((ws[ws.length - 1] - ws[0]) * 10) / 10 : null,
        off
      });
    })();
  }, [clientId, perDay]);

  if (!s || s.days + s.workouts + s.committed < 2) return null;
  const friday = new Date(todayKey() + "T12:00:00").getDay() === 5;
  const tiles: [string, string, string][] = [
    ["🍽️", s.mealPct === null ? `${s.days} أيام` : `${s.mealPct}%`, s.mealPct === null ? "سجلتي فيها" : "التزام بالوجبات"],
    ["💧", `${s.water}`, "أكواب في اليوم"],
    ["💪", `${s.workouts}`, s.workouts === 1 ? "تمرين" : "تمارين"]
  ];
  if (s.avgCal) tiles.unshift(["🔥", `${s.avgCal}`, "متوسط سعراتك"]);
  if (s.avgP) tiles.splice(1, 0, ["🥩", `${s.avgP}g`, "متوسط البروتين"]);
  tiles.unshift(["📅", `${s.committed} من 7`, "أيام التزمتي"]);
  if (s.steps) tiles.push(["👟", s.steps.toLocaleString("en-US"), "خطوة في اليوم"]);
  if (s.weight !== null) tiles.push(["⚖️", `${s.weight > 0 ? "+" : ""}${s.weight}`, "كجم آخر أسبوعين"]);

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">📈</span>
        <h2>{friday ? "📊 ملخص أسبوعك" : "أسبوعك"}</h2>
        <span className="aside">آخر ٧ أيام</span>
      </div>
      <section className="card stack" style={{ gap: 12, ...(friday ? { borderColor: "var(--clay)", borderWidth: 1.5 } : {}) }}>
        <b style={{ color: "var(--navy)" }}>{headline(s)}</b>
        <div className="week-tiles">
          {tiles.map(([em, v, l]) => (
            <div key={l}>
              <span aria-hidden="true">{em}</span>
              <b className="num" dir="ltr">{v}</b>
              <small>{l}</small>
            </div>
          ))}
        </div>
        <button type="button" className="share-btn" style={{ alignSelf: "flex-start" }} onClick={() => setShare(true)}>📤 شاركي أسبوعك</button>
        {s.off ? <p className="note">🍔 سجلتي {s.off} مرات أكل برا الخطة، صراحتك تساعد المدربة تعدل لك.</p> : null}
      </section>
      {share ? <ShareSheet card={{ kind: "week", days: s.committed, avgCal: s.avgCal, avgP: s.avgP, weight: s.weight, show: false }} numberToggle={s.weight !== null} onClose={() => setShare(false)} /> : null}
    </>
  );
}
