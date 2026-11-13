"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import Link from "next/link";
import type { ReactNode } from "react";

/** Macro colours on the navy card (protein navy reads as light navy here). */
const MAC_ON_NAVY = { p: "#8FA0C4", c: "#E8602C", f: "#F2A27F" };

export type Totals = { cal: number; p: number; c: number; f: number };
export type Target = { cal: number; p: number; c: number; f: number };

/**
 * The day's calorie card, the same in «وجباتي» and «سعراتي».
 * The ring shows what is left and fills as she eats; the macro rows show what is
 * left of each. It starts from zero eaten: only ticked meals and logged food count.
 */
export function CalorieCard({ totals, target, header, footer, line, details, hide = false }: { totals: Totals; target: Target | null; header?: ReactNode; footer?: ReactNode; line?: ReactNode; details?: ReactNode; hide?: boolean }) {
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
            {hide ? (
              <text x="60" y="66" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{target ? (left >= 0 ? "باقي لك" : "زيادة") : "اليوم"}</text>
            ) : (
              <>
                <text x="60" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{(target ? Math.abs(left) : eaten).toLocaleString("en-US")}</text>
                <text x="60" y="78" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,.75)">{target ? (left >= 0 ? "باقي" : "زيادة") : "سعرة"}</text>
              </>
            )}
          </svg>
          <div className="cal-side">
            {target ? null : <Link href="/app/guide?tab=calc" className="cal-goal">حطي هدفك اليومي من الحاسبة</Link>}
            <div className="cal-macros">
              {([["p", totals.p, target?.p], ["c", totals.c, target?.c], ["f", totals.f, target?.f]] as ["p" | "c" | "f", number, number | undefined][]).map(([l, v, t]) => {
                const rest = t ? Math.round(t - v) : 0;
                return (
                  <div key={l}>
                    <span><MacLabel k={l} /></span>
                    {hide ? null : <b className="num">{t ? (rest >= 0 ? <>باقي {rest} غ</> : <>زيادة {-rest} غ</>) : <>{Math.round(v)} غ</>}</b>}
                    {t ? <i aria-hidden="true"><i style={{ width: `${Math.min(100, (v / t) * 100)}%`, background: MAC_ON_NAVY[l] }} /></i> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {line ? <div className="cal-line in">{line}</div> : null}
        {details}
        {footer}
      </section>
    </>
  );
}
