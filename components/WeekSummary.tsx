"use client";

import { useEffect, useState } from "react";
import { todayKey, waterCups, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";
import { inPeriod, type PeriodLog } from "@/lib/period";
import { tickedMeals } from "@/lib/meal-resolve";
import { ShareSheet } from "@/components/ShareSheet";

type Stats = { dayOn: boolean[]; dayKeys: string[]; target: { cal: number; p: number } | null; cups: number; mealPct: number | null; days: number; committed: number; avgCal: number | null; avgP: number | null; water: number; workouts: number; steps: number | null; weight: number | null; off: number };

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
      const [{ data: d }, { data: w }, { data: b }, { data: pl }, { data: fe }, { data: tg }] = await Promise.all([
        supabase.from("daily_logs").select("log_date, meals, water").eq("client_id", clientId).gte("log_date", days[6]),
        supabase.from("workout_logs").select("performed_on").eq("client_id", clientId).gte("performed_on", days[6]),
        supabase.from("body_logs").select("log_date, weight_kg").eq("client_id", clientId).not("weight_kg", "is", null).gte("log_date", dayKeys(14)[13]).order("log_date", { ascending: true }),
        supabase.from("period_logs").select("*").eq("client_id", clientId).order("start_date", { ascending: false }).limit(3),
        supabase.from("food_entries").select("log_date, cal, p").eq("client_id", clientId).gte("log_date", days[6]),
        meal?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal, p").eq("client_id", clientId).maybeSingle()
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
      const order = [...days].reverse();
      const allW = ((b as { log_date: string; weight_kg: number }[] | null) || []).map((x) => Number(x.weight_kg));
      setS({
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

  if (!s || s.days + s.workouts + s.committed < 2) return null;
  const friday = new Date(todayKey() + "T12:00:00").getDay() === 5;
  const today = todayKey();
  const bar = (v: number, goal: number) => <i className="wk-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (v / goal) * 100)}%` }} /></i>;
  const metrics: { em: string; tone: string; label: string; value: string; extra?: React.ReactNode }[] = [];
  if (s.avgCal) metrics.push({ em: "🔥", tone: "cal", label: "متوسط سعراتك", value: `${s.avgCal}`, extra: s.target ? <>{bar(s.avgCal, s.target.cal)}<small>هدفك {s.target.cal}</small></> : null });
  if (s.avgP) metrics.push({ em: "🥩", tone: "pro", label: "متوسط البروتين", value: `${s.avgP}g`, extra: s.target?.p ? <>{bar(s.avgP, s.target.p)}<small>هدفك {s.target.p}g</small></> : null });
  metrics.push({ em: "💧", tone: "wat", label: "الماء في اليوم", value: `${s.water} أكواب`, extra: <>{bar(s.water, s.cups)}<small>هدفك {s.cups}</small></> });
  metrics.push({ em: "💪", tone: "wo", label: "تمارين", value: `${s.workouts}`, extra: <span className="wk-dots" aria-hidden="true">{Array.from({ length: Math.max(3, s.workouts) }, (_, i) => <i key={i} className={i < s.workouts ? "on" : ""} />)}</span> });
  if (s.steps) metrics.push({ em: "👟", tone: "st", label: "خطوات في اليوم", value: s.steps.toLocaleString("en-US") });
  if (s.weight !== null) metrics.push({ em: "⚖️", tone: s.weight <= 0 ? "down" : "up", label: "تغير الوزن (أسبوعين)", value: `${s.weight > 0 ? "+" : ""}${s.weight} كجم` });

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">📈</span>
        <h2>{friday ? "📊 ملخص أسبوعك" : "أسبوعك"}</h2>
        <span className="aside">آخر ٧ أيام</span>
      </div>
      <section className={`wk ${friday ? "fri" : ""}`}>
        <b className="wk-head">{headline(s)}</b>
        <div className="wk-strip" role="list" aria-label={`التزمتي ${s.committed} من 7 أيام`}>
          {s.dayKeys.map((k, i) => (
            <span key={k} role="listitem" className={`${s.dayOn[i] ? "on" : ""} ${k === today ? "now" : ""}`}>
              <small>{["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"][new Date(k + "T12:00:00").getDay()]}</small>
              <i aria-label={s.dayOn[i] ? "التزمتي" : "ما سجلتي"}>{s.dayOn[i] ? "✓" : new Date(k + "T12:00:00").getDate()}</i>
            </span>
          ))}
        </div>
        <p className="wk-count"><b className="num">{s.committed}</b> من ٧ أيام التزمتي فيها</p>
        <div className="wk-grid">
          {metrics.map((m) => (
            <div key={m.label} className={`wk-m ${m.tone}`}>
              <span className="wk-em" aria-hidden="true">{m.em}</span>
              <small>{m.label}</small>
              <b className="num" dir="ltr">{m.value}</b>
              {m.extra || null}
            </div>
          ))}
        </div>
        <div className="row between wrap" style={{ gap: 8 }}>
          {s.off ? <span className="note">🍔 سجلتي {s.off} مرات أكل برا الخطة.</span> : <span />}
          <button type="button" className="share-btn" style={{ margin: 0 }} onClick={() => setShare(true)}>📤 شاركي أسبوعك</button>
        </div>
      </section>
      {share ? <ShareSheet card={{ kind: "week", days: s.committed, avgCal: s.avgCal, avgP: s.avgP, weight: s.weight, show: false }} numberToggle={s.weight !== null} onClose={() => setShare(false)} /> : null}
    </>
  );
}
