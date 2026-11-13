"use client";

import { useState } from "react";
import { ShareSheet } from "@/components/ShareSheet";
import type { CalDay } from "@/components/CaloriesChart";

const DAY_L = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

/** One small plate: full (90%+ of the goal) in orange, otherwise navy up to how full it was. Off day: grey. */
function MiniPlate({ pct, off }: { pct: number; off?: boolean }) {
  const R = 16, C = 2 * Math.PI * R;
  const full = pct >= 0.9;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="var(--sunken)" stroke="var(--line-2)" strokeWidth="1" />
      {off ? (
        <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-3)">أوف</text>
      ) : full ? (
        <circle cx="20" cy="20" r="15" fill="url(#wp-full)" />
      ) : pct > 0 ? (
        <circle cx="20" cy="20" r={R / 2} fill="none" stroke="var(--navy)" strokeWidth={R} strokeDasharray={`${(C / 2) * pct} ${C}`} transform="rotate(-90 20 20)" style={{ transition: "stroke-dasharray .5s cubic-bezier(.2,.8,.2,1)" }} />
      ) : null}
    </svg>
  );
}

/** «صحون الأسبوع» in «تقدمي»: the last 7 days as small plates. */
export function WeekPlates({ rows, target }: { rows: CalDay[] | null; target: number | null }) {
  const [share, setShare] = useState(false);
  if (!rows || !rows.length) return null;
  const today = rows[rows.length - 1].d;
  const pct = (r: CalDay) => (target && r.cal ? Math.min(1, r.cal / target) : r.cal ? 0.5 : 0);
  const logged = rows.filter((r) => r.cal > 0 && !r.off);
  return (
    <>
      <div className="sec-title">
        <h2>صحون الأسبوع</h2>
        <button type="button" className="sec-link" onClick={() => setShare(true)}>شاركي</button>
      </div>
      <section className="card week-plates" aria-label="صحون آخر 7 أيام">
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <linearGradient id="wp-full" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#F28B5C" /><stop offset="100%" stopColor="#D2501F" /></linearGradient>
          </defs>
        </svg>
        <div className="wp-row">
          {rows.map((r) => (
            <div key={r.d} className="wp-day">
              <MiniPlate pct={r.off ? 0 : pct(r)} off={r.off} />
              <span className={r.d === today ? "now" : ""}>{DAY_L[new Date(r.d + "T12:00:00").getDay()]}</span>
            </div>
          ))}
        </div>
        <div className="wp-key">
          <span><i className="full" />صحن كامل</span>
          <span><i className="part" />ناقص</span>
        </div>
      </section>
      {share ? (
        <ShareSheet card={{ kind: "week", on: rows.map((r) => r.cal > 0 && !r.off), avgCal: logged.length ? Math.round(logged.reduce((a, r) => a + r.cal, 0) / logged.length) : null, avgP: logged.length ? Math.round(logged.reduce((a, r) => a + r.p, 0) / logged.length) : null, workouts: null, weight: null }} onClose={() => setShare(false)} />
      ) : null}
    </>
  );
}
