"use client";

import { isOff, loadOff } from "@/lib/off-days";
import { SecH } from "@/components/SecH";
import { useEffect, useState } from "react";
import { tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { todayKey, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

export type CalDay = { d: string; cal: number; p: number; off?: boolean };

const short = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric" }).format(new Date(d + "T12:00:00"));

/** "N days" in Arabic: يوم واحد / يومين / 3 أيام / 11 يوم. */
export function daysText(n: number) {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  return `${n} ${n <= 10 ? "أيام" : "يوم"}`;
}

/** "from N days she logged": من يوم واحد سجلتيه / من يومين سجلتيهم / من 5 أيام سجلتيها. */
export function loggedDaysText(n: number) {
  return n === 1 ? "يوم واحد سجلتيه" : n === 2 ? "يومين سجلتيهم" : `${daysText(n)} سجلتيها`;
}

/** Calories and protein per day for the last `n` days: ticked plan meals + food logged in «سعراتي». */
export function useCalorieDays(clientId: string | null | undefined, mealRow: Plan | null, n = 7) {
  const [rows, setRows] = useState<CalDay[] | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const plan = (mealRow?.data as MealPlanData | undefined) || null;

  useEffect(() => {
    if (!clientId) return;
    const t = new Date(todayKey() + "T12:00:00");
    const days = Array.from({ length: n }, (_, i) => {
      const x = new Date(t);
      x.setDate(t.getDate() - (n - 1 - i));
      return x.toISOString().slice(0, 10);
    });
    (async () => {
      const [{ data: d }, { data: e }, ch, tg, off] = await Promise.all([
        supabase.from("daily_logs").select("log_date, meals").eq("client_id", clientId).gte("log_date", days[0]),
        supabase.from("food_entries").select("log_date, cal, p").eq("client_id", clientId).gte("log_date", days[0]),
        mealRow ? supabase.from("plan_choices").select("data").eq("plan_id", mealRow.id).maybeSingle() : Promise.resolve({ data: null }),
        plan?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal").eq("client_id", clientId).maybeSingle(),
        loadOff(clientId, days[0])
      ]);
      setTarget(plan?.target.cal || (tg.data as { cal: number } | null)?.cal || null);
      const swaps = ((ch.data as { data?: { meals?: Record<string, MealRef> } } | null)?.data?.meals) || {};
      const logs = new Map(((d as { log_date: string; meals: Record<string, unknown> }[] | null) || []).map((x) => [x.log_date, x.meals]));
      const ent = (e as { log_date: string; cal: number; p: number }[] | null) || [];
      setRows(days.map((day) => {
        const tk = tickedMeals(plan, swaps, logs.get(day));
        const de = ent.filter((x) => x.log_date === day);
        return {
          off: isOff(off, day),
          d: day,
          cal: Math.round(tk.reduce((a, x) => a + x.meal.cal, 0) + de.reduce((a, x) => a + Number(x.cal), 0)),
          p: Math.round(tk.reduce((a, x) => a + x.meal.p, 0) + de.reduce((a, x) => a + Number(x.p), 0))
        };
      }));
    })();
  }, [clientId, mealRow, plan, n]);

  return { rows, target };
}

/** «تقدمي»: calories she logged each day of the last week, against her target. Days without a log show as a dotted empty bar. */
export function CaloriesChart({ rows, target }: { rows: CalDay[] | null; target: number | null }) {
  const [sel, setSel] = useState<number | null>(null);
  if (!rows) return null;
  if (!rows.some((r) => r.cal > 0 && !r.off)) {
    return (
      <>
        <SecH icon="cal" title="سعراتك" />
        <section className="card empty-mini">
          <p className="small muted">سعراتك لآخر 7 أيام تطلع هنا كأعمدة، مقارنة بهدفك. أول خطوة: سجلي أول شي أكلتيه اليوم.</p>
          <a className="btn btn-s btn-sm" href="/app/food">سجلي أكلك</a>
        </section>
      </>
    );
  }
  const logged = rows.filter((r) => r.cal > 0 && !r.off);
  const avg = Math.round(logged.reduce((a, r) => a + r.cal, 0) / logged.length);
  const max = Math.max(...rows.map((r) => r.cal), target || 0, 1) * 1.12;
  const W = 340, H = 150, top = 14, base = H - 4;
  const slot = W / rows.length;
  const bw = Math.min(30, slot - 12);
  const y = (v: number) => base - (v / max) * (base - top);
  const emptyH = (base - top) * 0.45;
  const s = sel !== null ? rows[sel] : null;

  return (
    <>
      <SecH icon="cal" title="سعراتك" />
      <section className="card stack" aria-label="سعراتك آخر 7 أيام">
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <span className="label" style={{ display: "block" }}>متوسط {loggedDaysText(logged.length)}</span>
            <b className="num" style={{ fontSize: 26, color: "var(--navy)" }}>{avg}</b>
            {target ? <span className="small muted"> من هدف {target}</span> : null}
          </div>
          <span className="small" style={{ textAlign: "end", minHeight: 36 }}>
            {s ? <><b>{short(s.d)}</b><br />{s.off ? "يوم أوف" : s.cal ? `${s.cal} سعرة · بروتين ${s.p} غ` : "ما سجلتي"}</> : <span className="note">اضغطي على أي يوم</span>}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", height: "auto", direction: "ltr", overflow: "visible" }} role="img"
          aria-label={`سعراتك آخر 7 أيام، المتوسط ${avg}${target ? ` والهدف ${target}` : ""}`}>
          <line x1="0" x2={W} y1={base} y2={base} stroke="var(--line)" strokeWidth="1" />
          {rows.map((r, i) => {
            const x = i * slot + (slot - bw) / 2;
            const h = r.cal ? Math.max(4, base - y(r.cal)) : 0;
            const over = target ? r.cal > target * 1.1 : false;
            return (
              <g key={r.d} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: "pointer" }}>
                <rect x={i * slot} y={top} width={slot} height={base - top} fill="transparent" />
                {r.off ? (
                  <>
                    <rect x={x} y={base - emptyH * 0.6} width={bw} height={emptyH * 0.6} rx={4} fill="var(--line-2)" opacity={0.7} />
                    <text x={x + bw / 2} y={base - emptyH * 0.6 - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-3)">أوف</text>
                  </>
                ) : h ? (
                  <path d={`M${x},${base} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} fill={over ? "var(--clay-ink)" : "var(--clay)"} opacity={sel === null || sel === i ? 1 : 0.45} />
                ) : (
                  <rect x={x + 0.75} y={base - emptyH} width={bw - 1.5} height={emptyH - 0.75} rx={4} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 3" opacity={0.7} />
                )}
                <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{["ح", "ن", "ث", "ر", "خ", "ج", "س"][new Date(r.d + "T12:00:00").getDay()]}</text>
                <title>{`${short(r.d)}: ${r.off ? "يوم أوف" : r.cal || "ما سجلتي"}`}</title>
              </g>
            );
          })}
          {target ? (
            <>
              <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="var(--navy)" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x={W} y={y(target) - 4} textAnchor="end" fontSize="10" fill="var(--navy)">هدفك {target}</text>
            </>
          ) : null}
        </svg>
        <p className="note">آخر 7 أيام: وجبات خطتك اللي علمتيها مع اللي سجلتيه في «سعراتي». العمود الغامق يعني زدتي عن هدفك بأكثر من 10%، والعمود المنقط يوم ما سجلتي فيه.{rows.some((r) => r.off) ? " والرمادي يوم أوف، ما يدخل في المتوسط." : ""}</p>
      </section>
    </>
  );
}
