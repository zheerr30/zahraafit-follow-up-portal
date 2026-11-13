"use client";

import { BACK, FRONT, type Shape } from "@/lib/share-card";

const MAIN = "#E8602C";
const HELP = "#F2A27F";

/** Front and back body: main muscles in red, helper muscles in blue (like the exercise apps). */
function Body({ map, primary, secondary, label }: { map: Record<string, Shape[]>; primary: Set<string>; secondary: Set<string>; label: string }) {
  return (
    <figure className="mm-fig">
      <svg viewBox="20 8 160 400" role="img" aria-label={label}>
        <g fill="var(--mm-body)">
          <ellipse cx="100" cy="40" rx="21" ry="25" />
          <rect x="91" y="60" width="18" height="18" rx="6" />
          <path d="M58 80 Q100 70 142 80 L136 150 L130 212 L70 212 L64 150 Z" />
        </g>
        <g stroke="var(--mm-body)" strokeLinecap="round" fill="none">
          <path d="M56 92 L46 160" strokeWidth="20" /><path d="M46 160 L40 216" strokeWidth="16" />
          <path d="M144 92 L154 160" strokeWidth="20" /><path d="M154 160 L160 216" strokeWidth="16" />
          <path d="M85 215 L83 300" strokeWidth="30" /><path d="M83 300 L84 392" strokeWidth="22" />
          <path d="M115 215 L117 300" strokeWidth="30" /><path d="M117 300 L116 392" strokeWidth="22" />
        </g>
        {Object.entries(map).map(([m, shapes]) => {
          const main = primary.has(m), help = !main && secondary.has(m);
          return shapes.map(([cx, cy, rx, ry, rot], i) => (
            <ellipse key={`${m}${i}`} cx={cx} cy={cy} rx={rx * 1.2} ry={ry * 1.12} transform={rot ? `rotate(${(rot * 180) / Math.PI} ${cx} ${cy})` : undefined}
              fill={main ? MAIN : help ? HELP : "var(--mm-muscle)"} opacity={main ? 0.95 : help ? 0.8 : 1} />
          ));
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function MuscleMap({ primary, secondary }: { primary: string[]; secondary: string[] }) {
  const p = new Set(primary), s = new Set(secondary.filter((m) => !p.has(m)));
  return (
    <div className="mm">
      <div className="mm-bodies">
        <Body map={FRONT} primary={p} secondary={s} label="من قدام" />
        <Body map={BACK} primary={p} secondary={s} label="من ورا" />
      </div>
      <div className="mm-legend">
        <span><i style={{ background: MAIN }} />العضلة الأساسية</span>
        <span><i style={{ background: HELP }} />عضلات مساعدة</span>
      </div>
    </div>
  );
}
