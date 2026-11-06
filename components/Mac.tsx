// Macro markers: a small colored dot before the name, the same colors everywhere
// (protein green, carbs blue, fat amber). Colors live in globals.css (--protein, --carb, --fat).

export type MacKey = "p" | "c" | "f";
export const MAC_NAME: Record<MacKey, string> = { p: "بروتين", c: "كارب", f: "دهون" };
export const MAC_COLOR: Record<MacKey, string> = { p: "var(--protein)", c: "var(--carb)", f: "var(--fat)" };

export function Dot({ k }: { k: MacKey }) {
  return <i className={`mdot mdot-${k}`} aria-hidden="true" />;
}

/** «● بروتين» */
export function MacLabel({ k, suffix }: { k: MacKey; suffix?: string }) {
  return <><Dot k={k} />{MAC_NAME[k]}{suffix ? ` ${suffix}` : ""}</>;
}

/** Short line «● 48 · ● 66 · ● 24» (with the names for screen readers). */
export function MacLine({ p, c, f, unit = "" }: { p: number | string; c: number | string; f: number | string; unit?: string }) {
  return (
    <span className="mac-line" aria-label={`بروتين ${p} كارب ${c} دهون ${f}`}>
      <span aria-hidden="true"><Dot k="p" />{p}{unit}</span>
      <span aria-hidden="true" className="mac-sep">·</span>
      <span aria-hidden="true"><Dot k="c" />{c}{unit}</span>
      <span aria-hidden="true" className="mac-sep">·</span>
      <span aria-hidden="true"><Dot k="f" />{f}{unit}</span>
    </span>
  );
}
