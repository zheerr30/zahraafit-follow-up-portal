"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Snack } from "@/lib/snacks";

/** «سناكات مقترحة» in «سعراتي»: the coach's snacks, or general ones that fit what is left. */
export function SuggestedSnacks({ snacks, fromCoach, left, onAdd }: { snacks: Snack[]; fromCoach: boolean; left: number | null; onAdd: (s: Snack) => Promise<boolean> }) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  if (!snacks.length) return null;
  // General ones: only what fits the calories left (or the lightest few), most protein first.
  const list = fromCoach
    ? [...snacks].sort((a, b) => Number(left !== null && a.cal > left) - Number(left !== null && b.cal > left))
    : (() => {
        const fit = left !== null && left > 0 ? snacks.filter((s) => s.cal <= left) : snacks;
        const pool = fit.length ? fit : [...snacks].sort((a, b) => a.cal - b.cal).slice(0, 3);
        return [...pool].sort((a, b) => b.p / Math.max(1, b.cal) - a.p / Math.max(1, a.cal)).slice(0, 6);
      })();

  return (
    <section id="snacks" className="snacks">
      <div className="row between">
        <b>🍎 سناكات مقترحة</b>
        <span className="note">{fromCoach ? "اختارتها لك المدربة" : left !== null && left > 0 ? `تناسب الباقي لك (${left} سعرة)` : "خفيفة"}</span>
      </div>
      <div className="snack-row">
        {list.map((s) => {
          const on = added.has(s.name);
          const tooMuch = left !== null && s.cal > left;
          return (
            <div key={s.name} className="snack" style={{ opacity: tooMuch && !on ? 0.6 : 1 }}>
              <b>{s.name}</b>
              <span className="note">{s.detail}</span>
              <span className="snack-mac"><MacLine p={Math.round(s.p)} c={Math.round(s.c)} f={Math.round(s.f)} /></span>
              <button type="button" aria-pressed={on} aria-label={on ? `انضاف ${s.name}` : `أضيفي ${s.name}`} disabled={on} onClick={async () => {
                if (await onAdd(s)) setAdded((cur) => new Set(cur).add(s.name));
              }}>
                {on ? <><Check size={15} />انضاف</> : <><Plus size={15} />{s.cal} سعرة</>}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
