"use client";

import { isOff, loadOff } from "@/lib/off-days";
import { useEffect, useState } from "react";
import { todayKey, waterCups, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";
import { useWeekRecs } from "@/components/WeekRecs";
import { loggedDaysText } from "@/components/CaloriesChart";
import { inPeriod, type PeriodLog } from "@/lib/period";
import { tickedMeals } from "@/lib/meal-resolve";
import { ShareSheet } from "@/components/ShareSheet";

type Stats = { wChange: number | null; wAllPeriod: boolean; avgC: number | null; avgF: number | null; tC: number | null; tF: number | null; periodDays: number; eaten: number; planned: number; dayOn: boolean[]; dayKeys: string[]; target: { cal: number; p: number } | null; cups: number; mealPct: number | null; days: number; committed: number; avgCal: number | null; avgP: number | null; water: number; workouts: number; steps: number | null; weight: number | null; off: number };

function dayKeys(n: number) {
  const t = new Date(todayKey() + "T12:00:00");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(t);
    d.setDate(t.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

function headline(s: Stats) {
  if (s.mealPct !== null && s.mealPct >= 85) return "🌟 أسبوع قوي، التزامك يفرق. كملي كذا";
  if (s.mealPct !== null && s.mealPct >= 65) return "👏 أسبوع حلو، شوي بس وتوصلين للقمة";
  if (s.days >= 4) return "💪 كل يوم تسجلين فيه خطوة، الأسبوع الجاي نرفع الالتزام";
  return "🌱 سجلي أكلك وماك كل يوم، وبتشوفين الفرق";
}

/** "Your week" on the home screen: last 7 days at a glance. Hidden until she has logged at least two days. */
export function WeekSummary({ clientId, plans, hide = false }: { clientId: string; plans: Plan[]; hide?: boolean }) {
  const [s, setS] = useState<Stats | null>(null);
  const [share, setShare] = useState(false);
  const meal = plans.find((p) => p.kind === "nutrition" && p.data)?.data as MealPlanData | undefined;
  const perDay = meal?.days[0]?.meals.length || 0;
  const workoutDays = (plans.find((p) => p.kind === "workout" && p.data)?.data as { days?: unknown[] } | undefined)?.days?.length || null;

  useEffect(() => {
    const days = dayKeys(7);
    (async () => {
      const [{ data: d }, { data: w }, { data: b }, { data: pl }, { data: fe }, { data: tg }, offInfo] = await Promise.all([
        supabase.from("daily_logs").select("log_date, meals, water").eq("client_id", clientId).gte("log_date", days[6]),
        supabase.from("workout_logs").select("performed_on").eq("client_id", clientId).gte("performed_on", days[6]),
        supabase.from("body_logs").select("log_date, weight_kg").eq("client_id", clientId).not("weight_kg", "is", null).gte("log_date", dayKeys(14)[13]).order("log_date", { ascending: true }),
        supabase.from("period_logs").select("*").eq("client_id", clientId).order("start_date", { ascending: false }).limit(3),
        supabase.from("food_entries").select("log_date, cal, p, c, f").eq("client_id", clientId).gte("log_date", days[6]),
        meal?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal, p, c, f").eq("client_id", clientId).maybeSingle(),
        loadOff(clientId, days[6])
      ]);
      // Off days: what she ate is kept but not counted here.
      const onDay = (day: string) => !isOff(offInfo, day);
      // Calories and protein per day: ticked plan meals + logged food.
      const perDayTotals = new Map<string, { cal: number; p: number; c: number; f: number }>();
      const bump = (day: string, cal: number, p: number, c: number, f: number) => { const t = perDayTotals.get(day) || { cal: 0, p: 0, c: 0, f: 0 }; perDayTotals.set(day, { cal: t.cal + cal, p: t.p + p, c: t.c + (c || 0), f: t.f + (f || 0) }); };
      ((d as { log_date: string; meals: Record<string, unknown> }[] | null) || []).filter((x) => onDay(x.log_date)).forEach((x) => tickedMeals(meal || null, {}, x.meals).forEach((t) => bump(x.log_date, t.meal.cal, t.meal.p, t.meal.c, t.meal.f)));
      ((fe as { log_date: string; cal: number; p: number; c: number; f: number }[] | null) || []).filter((x) => onDay(x.log_date)).forEach((x) => bump(x.log_date, Number(x.cal), Number(x.p), Number(x.c), Number(x.f)));
      const counted = Array.from(perDayTotals.values()).filter((t) => t.cal > 0);
      const periods = (pl as PeriodLog[] | null) || [];
      const logs = ((d as { log_date: string; meals: Record<string, unknown>; water: number }[] | null) || []).filter((x) => onDay(x.log_date));
      const eaten = logs.reduce((a, x) => a + Object.entries(x.meals || {}).filter(([k, v]) => /^\d+-\d+$/.test(k) && v === true).length, 0);
      const steps = logs.map((x) => Number((x.meals?._day as { steps?: string } | undefined)?.steps?.replace(/\D/g, "")) || 0).filter(Boolean);
      const off = logs.reduce((a, x) => a + (Array.isArray(x.meals?._off) ? (x.meals._off as unknown[]).length : 0), 0);
      // Period-day weights don't count toward the change.
      const ws = ((b as { log_date: string; weight_kg: number }[] | null) || []).filter((x) => !inPeriod(periods, x.log_date)).map((x) => Number(x.weight_kg));
      const order = [...days].reverse();
      const allW = ((b as { log_date: string; weight_kg: number }[] | null) || []).map((x) => Number(x.weight_kg));
      const tg2 = meal?.target.cal ? meal.target : ((tg as { cal: number; p: number; c: number; f: number } | null) || null);
      const avg = (k: "c" | "f") => (counted.length ? Math.round(counted.reduce((a, t) => a + t[k], 0) / counted.length) : null);
      const allB = ((b as { log_date: string; weight_kg: number }[] | null) || []);
      const wkSet = new Set(days), prevSet = new Set(dayKeys(14).slice(7));
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
      const thisAll = allB.filter((x) => wkSet.has(x.log_date));
      const thisW = mean(thisAll.filter((x) => !inPeriod(periods, x.log_date)).map((x) => Number(x.weight_kg)));
      const prevW = mean(allB.filter((x) => prevSet.has(x.log_date) && !inPeriod(periods, x.log_date)).map((x) => Number(x.weight_kg)));
      setS({
        wChange: thisW !== null && prevW !== null ? Math.round((thisW - prevW) * 10) / 10 : null,
        wAllPeriod: thisAll.length > 0 && thisW === null,
        avgC: avg("c"),
        avgF: avg("f"),
        tC: tg2?.c || null,
        tF: tg2?.f || null,
        periodDays: days.filter((k) => inPeriod(periods, k)).length,
        eaten,
        planned: perDay * logs.length,
        dayOn: order.map((k) => (perDayTotals.get(k)?.cal || 0) > 0),
        dayKeys: order,
        target: meal?.target.cal ? { cal: meal.target.cal, p: meal.target.p } : ((tg as { cal: number; p: number } | null) || null),
        cups: waterCups(allW.length ? allW[allW.length - 1] : null),
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

  const week = s
    ? {
        daysLogged: Math.max(s.days, s.committed), committed: s.committed, avgCal: s.avgCal, avgP: s.avgP, avgC: s.avgC, avgF: s.avgF,
        targetCal: s.target?.cal || null, targetP: s.target?.p || null, targetC: s.tC, targetF: s.tF,
        water: s.water, waterGoal: s.cups, mealsPlanned: s.planned || null, mealsEaten: s.planned ? s.eaten : null, outside: s.off,
        workouts: s.workouts, workoutDays, weightChange: s.wChange, periodDays: s.periodDays
      }
    : null;
  const { recs, state } = useWeekRecs(week);
  if (!s) return null;
  const few = Math.max(s.days, s.committed) < 3;
  const first = few
    ? (state === "ok" && recs?.[0]) || "سجلي أكلك كل يوم هالأسبوع، وبعد 3 أيام تسجيل يطلع لك ملخص وتوصيات على أسبوعك."
    : state === "ok" && recs?.length ? recs[0] : state === "loading" ? "نجهز ملخص أسبوعك…" : headline(s).replace(/\p{Extended_Pictographic}/gu, "").trim();
  const nextRecs = !few && state === "ok" && recs ? recs.slice(1) : [];

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">📊</span>
        <h2>ملخص أسبوعك</h2>
        <span className="aside">آخر 7 أيام</span>
      </div>
      <section className="card stack wk2">
        <p className="wk2-first">{first}</p>
        {!hide && (s.avgCal || s.avgP) ? (
          <div className="wk2-pair">
            {s.avgCal ? <div><small>متوسط السعرات</small><b className="num">{s.avgCal}</b><small>من {loggedDaysText(s.committed)}</small></div> : null}
            {s.avgP ? <div><small>متوسط البروتين</small><b className="num">{s.avgP} غ</b><small>من {loggedDaysText(s.committed)}</small></div> : null}
          </div>
        ) : null}
        {hide ? null : s.wAllPeriod ? (
          <div className="wk2-row"><span>⚖️ الوزن</span><span className="note">الوزن هالأسبوع ما ينحسب، أيام الدورة</span></div>
        ) : s.wChange !== null ? (
          <div className="wk2-row"><span>⚖️ الوزن عن الأسبوع اللي قبل</span><b className="num"><span dir="ltr">{s.wChange > 0 ? "+" : ""}{s.wChange}</span> كجم</b></div>
        ) : null}
        {workoutDays ? (
          <div className="wk2-row"><span>💪 التمارين</span><b className="num">{s.workouts} من {workoutDays}</b></div>
        ) : null}
        {state === "pending" && !few ? <p className="note">توصيات أسبوعك عند المدربة تراجعها، وبتطلع لك في «تقدمي».</p> : null}
        {nextRecs.length ? (
          <div className="wk2-next">
            <b>لأسبوعك الجاي</b>
            <ol className="recs-list">{nextRecs.map((r) => <li key={r}>{r}</li>)}</ol>
          </div>
        ) : null}
        <button type="button" className="btn btn-s btn-block" onClick={() => setShare(true)}>📤 شاركي أسبوعك</button>
      </section>
      {share ? <ShareSheet card={{ kind: "week", on: s.dayOn, avgCal: s.avgCal, avgP: s.avgP, workouts: workoutDays ? s.workouts : null, weight: s.wChange }} onClose={() => setShare(false)} /> : null}
    </>
  );
}
