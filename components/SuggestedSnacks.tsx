"use client";

import { MacLine } from "@/components/Mac";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { Snack } from "@/lib/snacks";

/**
 * «سناكات مقترحة» in «سعراتي», folded by default. Opens by itself when her plan's meals
 * are done or what's left is enough for a snack. Ones that fit come first.
 */
export function SuggestedSnacks({ snacks, fromCoach, left, open: autoOpen, onAdd }: { snacks: Snack[]; fromCoach: boolean; left: number | null; open?: boolean; onAdd: (s: Snack) => Promise<boolean> }) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(Boolean(autoOpen));
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  if (!snacks.length) return null;

  const fits = (s: Snack) => left !== null && left > 0 && s.cal <= left;
  // General ones: what fits first (most protein per calorie), then the lightest of the rest.
  const pool = fromCoach ? snacks : [...snacks].sort((a, b) => b.p / Math.max(1, b.cal) - a.p / Math.max(1, a.cal));
  const list = [...pool].sort((a, b) => Number(fits(b)) - Number(fits(a)) || (fits(a) ? 0 : a.cal - b.cal)).slice(0, fromCoach ? 20 : 8);

  return (
    <section id="snacks" className="snacks">
      <button type="button" className="snacks-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>سناكات مقترحة</b>
        <span className="note">{fromCoach ? "من المدربة" : ""}{left !== null && left > 0 ? `${fromCoach ? " · " : ""}الباقي ${left} سعرة` : ""}</span>
        <ChevronDown size={18} className="snacks-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="snack-row">
          {list.map((s) => {
            const on = added.has(s.name);
            const ok = fits(s);
            const over = left !== null && s.cal > left ? Math.round(s.cal - Math.max(0, left)) : 0;
            return (
              <div key={s.name} className={`snack ${over && !on ? "over" : ""}`}>
                {ok ? <span className="snack-fit">يناسبك الحين</span> : over ? <span className="snack-over">يزيد {over} سعرة</span> : null}
                <b>{s.name}</b>
                <span className="snack-mac"><MacLine p={Math.round(s.p)} c={Math.round(s.c)} f={Math.round(s.f)} /></span>
                <span className="snack-foot">
                  <span className="num">{s.cal} سعرة</span>
                  <button type="button" aria-pressed={on} aria-label={on ? `انضاف ${s.name}` : `أضيفي ${s.name}`} disabled={on} onClick={async () => {
                    if (await onAdd(s)) setAdded((cur) => new Set(cur).add(s.name));
                  }}>
                    {on ? <Check size={16} /> : <Plus size={18} />}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
