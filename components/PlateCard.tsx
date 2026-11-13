"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Macros = { cal: number; p: number; c: number; f: number };

/** Eases a number to its new value (0.5s), so the plate fills smoothly. */
function useTween(target: number, ms = 550) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const x = a + (target - a) * e;
      setV(x);
      from.current = x;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const C = 120; // centre
const R_IN = 50; // the middle (number)
const R_OUT = 88; // edge of the food
const pt = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
};
/** A ring slice from angle a to b (degrees, clockwise from the top), between radii r1 and r2. */
function slice(a: number, b: number, r1: number, r2: number) {
  const large = b - a > 180 ? 1 : 0;
  return `M ${pt(r2, a)} A ${r2} ${r2} 0 ${large} 1 ${pt(r2, b)} L ${pt(r1, b)} A ${r1} ${r1} 0 ${large} 0 ${pt(r1, a)} Z`;
}

const PARTS = [
  { k: "p" as const, label: "بروتين", from: "#C9D2E6", to: "#8FA0C4", dot: "var(--protein-on-navy, #8FA0C4)" },
  { k: "c" as const, label: "كارب", from: "#F28B5C", to: "#D2501F", dot: "#E8602C" },
  { k: "f" as const, label: "دهون", from: "#F7BFA3", to: "#EE9468", dot: "#F2A27F" }
];

/**
 * The plate: protein, carbs and fat as three parts sized by each one's share of the day's
 * calories; each part fills from the middle to the edge as she eats. The calories left in the
 * middle. Off day: no proportions. «hide numbers»: no numbers at all.
 */
export function PlateCard({ eaten, target, off, hide, free }: { eaten: Macros; target: Macros | null; off: boolean; hide: boolean; free: boolean }) {
  const kp = target ? target.p * 4 : 1, kc = target ? target.c * 4 : 1, kf = target ? target.f * 9 : 1;
  const tot = kp + kc + kf || 3;
  const share = { p: kp / tot, c: kc / tot, f: kf / tot };
  const fill = {
    p: useTween(off || !target?.p ? 0 : Math.min(1, eaten.p / target.p)),
    c: useTween(off || !target?.c ? 0 : Math.min(1, eaten.c / target.c)),
    f: useTween(off || !target?.f ? 0 : Math.min(1, eaten.f / target.f))
  };
  const overall = target?.cal ? Math.min(1, eaten.cal / target.cal) : 0;
  const empty = !eaten.cal && !off;
  const left = target?.cal ? Math.round(target.cal - eaten.cal) : null;
  const shown = useTween(left !== null ? Math.abs(left) : Math.round(eaten.cal));

  const GAP = 4;
  let at = 0;
  return (
    <section className="plate-card" aria-label="صحنك اليوم">
      <div className="plate-wrap">
        <svg viewBox="0 0 240 240" className="plate-svg" aria-hidden="true">
          <defs>
            <radialGradient id="pl-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E8602C" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#E8602C" stopOpacity={0} />
            </radialGradient>
            {PARTS.map((x) => (
              <radialGradient key={x.k} id={`pl-${x.k}`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R_OUT}>
                <stop offset="45%" stopColor={x.from} />
                <stop offset="100%" stopColor={x.to} />
              </radialGradient>
            ))}
          </defs>
          <circle cx={C} cy={C} r={118} fill="url(#pl-glow)" style={{ opacity: off ? 0 : 0.15 + overall * 0.55, transition: "opacity .6s cubic-bezier(.2,.8,.2,1)" }} />
          <circle cx={C} cy={C} r={108} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.12)" strokeWidth={1.5} />
          <circle cx={C} cy={C} r={95} fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.07)" strokeWidth={1} />
          {PARTS.map((x) => {
            const span = share[x.k] * 360;
            const a = at + GAP / 2, b = at + span - GAP / 2;
            at += span;
            if (b <= a) return null;
            const r2 = R_IN + (R_OUT - R_IN) * fill[x.k];
            return (
              <g key={x.k}>
                <path d={slice(a, b, R_IN, R_OUT)} fill={`url(#pl-${x.k})`} opacity={0.13} />
                {r2 > R_IN + 0.5 ? <path d={slice(a, b, R_IN, r2)} fill={`url(#pl-${x.k})`} /> : null}
              </g>
            );
          })}
        </svg>
        <div className="plate-mid">
          {off ? (
            <b className="plate-off">يوم أوف</b>
          ) : empty ? (
            <span className="plate-empty">صحنك فاضي، <Link href="/app/food?tab=diary">سجلي أول أكلة</Link></span>
          ) : hide ? (
            <b className="plate-off">صحنك اليوم</b>
          ) : (
            <>
              <b className="num plate-num">{Math.round(shown).toLocaleString("en-US")}</b>
              <span>{left !== null && left < 0 ? "سعرة زيادة" : left !== null ? "سعرة باقية" : "سعرة أكلتيها"}</span>
            </>
          )}
        </div>
      </div>
      <div className="plate-key">
        {PARTS.map((x) => <span key={x.k}><i style={{ background: x.dot }} />{x.label}</span>)}
      </div>
      {free && target?.cal && !hide ? <p className="plate-note">هدفك <span className="num">{target.cal.toLocaleString("en-US")}</span> سعرة من الحاسبة</p> : null}
      {free && !target?.cal ? <p className="plate-note"><Link href="/app/guide?tab=calc">احسبي هدفك</Link> عشان يتقسم صحنك صح</p> : null}
    </section>
  );
}
