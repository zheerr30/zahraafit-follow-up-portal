"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { defaultSlot } from "@/lib/foods";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

type Item = { id: string; name: string; cal: number; p: number | null; c: number | null; f: number | null; coach_pick: boolean; tip: string | null; restaurants: { name: string; emoji: string | null } | null };

/** «🍔 طالع مطعم؟» on home: 2–3 restaurant dishes that fit what's left today, one tap to add. */
export function HomeRestaurants({ clientId, left, onAdded }: { clientId: string; left: number; onAdded?: () => void }) {
  const [all, setAll] = useState<Item[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  useEffect(() => {
    supabase.from("restaurant_items").select("id, name, cal, p, c, f, coach_pick, tip, restaurants(name, emoji)").order("coach_pick", { ascending: false }).limit(400)
      .then(({ data }) => setAll((data as unknown as Item[] | null) || []));
  }, []);
  if (!all) return null;
  const fit = all
    .filter((x) => added.has(x.id) || (Number(x.cal) <= left && Number(x.cal) >= Math.min(250, left * 0.4)))
    .sort((a, b) => Number(b.coach_pick) - Number(a.coach_pick) || Number(b.cal) - Number(a.cal))
    .slice(0, 3);
  if (!fit.length) return null;

  async function add(it: Item) {
    const { error } = await supabase.from("food_entries").insert({
      client_id: clientId, log_date: todayKey(), slot: defaultSlot(), name: `${it.name} (${it.restaurants?.name || "مطعم"})`,
      amount: 1, unit: "طلب", cal: Number(it.cal), p: Number(it.p) || 0, c: Number(it.c) || 0, f: Number(it.f) || 0
    });
    if (error) return;
    setAdded((s) => new Set(s).add(it.id));
    onAdded?.();
  }

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">🍔</span>
        <h2>طالع مطعم؟</h2>
        <span className="aside">يناسب الباقي لك ({left} سعرة)</span>
      </div>
      <section className="card" style={{ padding: "4px 16px" }}>
        {fit.map((it) => (
          <div key={it.id} className="diary-row">
            <span aria-hidden="true" style={{ fontSize: 22, flex: "none" }}>{it.restaurants?.emoji || "🍽️"}</span>
            <span style={{ minWidth: 0 }}>
              {it.coach_pick ? "⭐ " : ""}{it.name}
              <span className="note" style={{ display: "block" }}>{it.restaurants?.name}{it.tip ? ` · 💡 ${it.tip}` : ""}</span>
            </span>
            <button type="button" className="share-btn" style={{ margin: 0, flex: "none" }} disabled={added.has(it.id)} onClick={() => add(it)} aria-label={`أضيفي ${it.name}`}>
              {added.has(it.id) ? <><Check size={14} />انضاف</> : <><Plus size={14} />{Math.round(Number(it.cal))}</>}
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
