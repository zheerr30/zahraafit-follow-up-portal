"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import Link from "next/link";
import type { ReactNode } from "react";

export type Totals = { cal: number; p: number; c: number; f: number };
export type Target = { cal: number; p: number; c: number; f: number };

/**
 * The day's calorie card, the same in «وجباتي» and «سعراتي».
 * The ring shows what is left and fills as she eats; the macro rows show what is
 * left of each. It starts from zero eaten: only ticked meals and logged food count.
 */
export function CalorieCard({ totals, target, header, footer, line, details }: { totals: Totals; target: Target | null; header?: ReactNode; footer?: ReactNode; line?: ReactNode; details?: ReactNode }) {
  const eaten = Math.round(totals.cal);
  const left = target ? Math.round(target.cal - totals.cal) : 0;
  const fill = target && target.cal ? Math.min(1, totals.cal / target.cal) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const label = target ? (left >= 0 ? `باقي لك ${left} سعرة من ${target.cal}` : `زدتي ${-left} سعرة عن هدفك ${target.cal}`) : `أكلتي ${eaten} سعرة`;

  return (
    <>
      <section className="cal-hero">
        {header}
        <div className="cal-main">
          <svg viewBox="0 0 120 120" className="cal-ring" role="img" aria-label={label} style={{ direction: "ltr" }}>
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="10" />
            {fill > 0 ? (
              <circle cx="60" cy="60" r={R} fill="none" stroke={left >= 0 ? "var(--clay)" : "#E8602C"} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${C * fill} ${C}`} transform="rotate(-90 60 60)" />
            ) : null}
            <text x="60" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff">{target ? (left >= 0 ? left : `+${-left}`) : eaten}</text>
            <text x="60" y="78" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,.75)">{target ? (left >= 0 ? "باقي" : "زيادة") : "سعرة"}</text>
          </svg>
          <div className="cal-side">
            {target ? (
              <span className="cal-eaten">أكلتي <b>{eaten}</b> من {target.cal}</span>
            ) : (
              <Link href="/app/guide?tab=calc" className="cal-goal">🎯 حطي هدفك اليومي من الحاسبة</Link>
            )}
            <div className="cal-macros">
              {([["p", totals.p, target?.p], ["c", totals.c, target?.c], ["f", totals.f, target?.f]] as ["p" | "c" | "f", number, number | undefined][]).map(([l, v, t]) => {
                const rest = t ? Math.round(t - v) : 0;
                return (
                  <div key={l}>
                    <span><MacLabel k={l} /></span>
                    <b style={{ color: `var(--${l === "p" ? "protein" : l === "c" ? "carb" : "fat"})` }}>{t ? (rest >= 0 ? <>باقي {rest} غ</> : <>زيادة {-rest} غ</>) : <>{Math.round(v)} غ</>}</b>
                    {t ? <i aria-hidden="true"><i style={{ width: `${Math.min(100, (v / t) * 100)}%`, background: `var(--${l === "p" ? "protein" : l === "c" ? "carb" : "fat"})` }} /></i> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {details}
        {footer}
      </section>
      {line ? <div className="cal-line">{line}</div> : null}
    </>
  );
}
