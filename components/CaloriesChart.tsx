"use client";

import { useEffect, useState } from "react";
import { tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { todayKey, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

const DAYS = 14;
const short = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric" }).format(new Date(d + "T12:00:00"));

/** «تقدمي»: calories she logged each day for two weeks, against her target. */
export function CaloriesChart({ clientId, mealRow }: { clientId: string; mealRow: Plan | null }) {
  const [rows, setRows] = useState<{ d: string; cal: number; p: number }[] | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const plan = (mealRow?.data as MealPlanData | undefined) || null;

  useEffect(() => {
    const t = new Date(todayKey() + "T12:00:00");
    const days = Array.from({ length: DAYS }, (_, i) => {
      const x = new Date(t);
      x.setDate(t.getDate() - (DAYS - 1 - i));
      return x.toISOString().slice(0, 10);
    });
    (async () => {
      const [{ data: d }, { data: e }, ch, tg] = await Promise.all([
        supabase.from("daily_logs").select("log_date, meals").eq("client_id", clientId).gte("log_date", days[0]),
        supabase.from("food_entries").select("log_date, cal, p").eq("client_id", clientId).gte("log_date", days[0]),
        mealRow ? supabase.from("plan_choices").select("data").eq("plan_id", mealRow.id).maybeSingle() : Promise.resolve({ data: null }),
        plan?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal").eq("client_id", clientId).maybeSingle()
      ]);
      setTarget(plan?.target.cal || (tg.data as { cal: number } | null)?.cal || null);
      const swaps = ((ch.data as { data?: { meals?: Record<string, MealRef> } } | null)?.data?.meals) || {};
      const logs = new Map(((d as { log_date: string; meals: Record<string, unknown> }[] | null) || []).map((x) => [x.log_date, x.meals]));
      const ent = (e as { log_date: string; cal: number; p: number }[] | null) || [];
      setRows(days.map((day) => {
        const tk = tickedMeals(plan, swaps, logs.get(day));
        const de = ent.filter((x) => x.log_date === day);
        return {
          d: day,
          cal: Math.round(tk.reduce((a, x) => a + x.meal.cal, 0) + de.reduce((a, x) => a + Number(x.cal), 0)),
          p: Math.round(tk.reduce((a, x) => a + x.meal.p, 0) + de.reduce((a, x) => a + Number(x.p), 0))
        };
      }));
    })();
  }, [clientId, mealRow, plan]);

  if (!rows || rows.filter((r) => r.cal > 0).length < 2) return null;
  const logged = rows.filter((r) => r.cal > 0);
  const avg = Math.round(logged.reduce((a, r) => a + r.cal, 0) / logged.length);
  const max = Math.max(...rows.map((r) => r.cal), target || 0) * 1.1;
  const W = 340, H = 150, top = 8, base = H - 4;
  const slot = W / rows.length;
  const bw = Math.max(6, slot - 6);
  const y = (v: number) => base - (v / max) * (base - top);
  const s = sel !== null ? rows[sel] : null;

  return (
    <>
    <div className="sec-h"><h2>🔥 سعراتك</h2></div>
    <section className="card stack" aria-label="سعراتك آخر أسبوعين">
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div>
          <span className="label" style={{ display: "block" }}>🔥 متوسط سعراتك (الأيام اللي سجلتي فيها)</span>
          <b className="num" style={{ fontSize: 26, color: "var(--navy)" }}>{avg}</b>
          {target ? <span className="small muted"> من هدف {target}</span> : null}
        </div>
        <span className="small" style={{ textAlign: "end", minHeight: 36 }}>
          {s ? <><b>{short(s.d)}</b><br />{s.cal ? `${s.cal} سعرة · 💪 ${s.p}g` : "ما سجلتي"}</> : <span className="note">اضغطي على أي يوم</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", height: "auto", direction: "ltr", overflow: "visible" }} role="img"
        aria-label={`سعراتك آخر ${DAYS} يوم، المتوسط ${avg}${target ? ` والهدف ${target}` : ""}`}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--line)" strokeWidth="1" />
        {rows.map((r, i) => {
          const x = i * slot + (slot - bw) / 2;
          const h = r.cal ? Math.max(4, base - y(r.cal)) : 0;
          const over = target ? r.cal > target * 1.1 : false;
          return (
            <g key={r.d} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: "pointer" }}>
              <rect x={i * slot} y={top} width={slot} height={base - top} fill="transparent" />
              {h ? <path d={`M${x},${base} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} fill={over ? "var(--clay-ink)" : "var(--clay)"} opacity={sel === null || sel === i ? 1 : 0.45} /> : null}
              {i % 2 === (rows.length - 1) % 2 ? <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)">{new Date(r.d + "T12:00:00").getDate()}</text> : null}
              <title>{`${short(r.d)}: ${r.cal || "ما سجلتي"}`}</title>
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
      <p className="note">آخر {DAYS} يوم: وجبات خطتك اللي علمتيها + اللي سجلتيه في يومياتي. الغامق = زدتي عن هدفك بأكثر من ١٠٪.</p>
    </section>
    </>
  );
}
