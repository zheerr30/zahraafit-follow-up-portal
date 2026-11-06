"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { streakDays } from "@/components/Achievements";
import { defaultSlot } from "@/lib/foods";
import { tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { todayKey, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

type Item = { id: string; name: string; cal: number; p: number | null; c: number | null; f: number | null; coach_pick: boolean; tip: string | null; restaurants: { name: string; emoji: string | null } | null };

/** Home: days in a row, and restaurant dishes that fit what's left today. */
export function HomeBoosts({ clientId, plans }: { clientId: string; plans: Plan[] }) {
  const [streak, setStreak] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const today = todayKey();

  useEffect(() => {
    streakDays(clientId).then(setStreak);
    (async () => {
      const row = plans.find((p) => p.kind === "nutrition" && p.data && !p.variant);
      const plan = (row?.data as MealPlanData | undefined) || null;
      const [{ data: e }, { data: d }, { data: t }, ch, { data: ri }] = await Promise.all([
        supabase.from("food_entries").select("cal").eq("client_id", clientId).eq("log_date", today),
        supabase.from("daily_logs").select("meals").eq("client_id", clientId).eq("log_date", today).maybeSingle(),
        plan?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal").eq("client_id", clientId).maybeSingle(),
        row ? supabase.from("plan_choices").select("data").eq("plan_id", row.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("restaurant_items").select("id, name, cal, p, c, f, coach_pick, tip, restaurants(name, emoji)").order("coach_pick", { ascending: false }).limit(400)
      ]);
      const target = plan?.target.cal || (t as { cal: number } | null)?.cal || null;
      if (!target) return;
      const swaps = ((ch.data as { data?: { meals?: Record<string, MealRef> } } | null)?.data?.meals) || {};
      const eaten = ((e as { cal: number }[] | null) || []).reduce((a, x) => a + Number(x.cal), 0)
        + tickedMeals(plan, swaps, (d?.meals as Record<string, unknown>) || {}).reduce((a, x) => a + x.meal.cal, 0);
      const l = Math.round(target - eaten);
      setLeft(l);
      const fit = ((ri as unknown as Item[] | null) || []).filter((x) => Number(x.cal) <= l && Number(x.cal) >= Math.min(250, l * 0.4));
      // Coach picks first, then the most filling that still fits.
      setItems(fit.sort((a, b) => Number(b.coach_pick) - Number(a.coach_pick) || Number(b.cal) - Number(a.cal)).slice(0, 5));
    })();
  }, [clientId, plans, today]);

  async function add(it: Item) {
    const { error } = await supabase.from("food_entries").insert({
      client_id: clientId, log_date: today, slot: defaultSlot(), name: `${it.name} (${it.restaurants?.name || "مطعم"})`,
      amount: 1, unit: "طلب", cal: Number(it.cal), p: Number(it.p) || 0, c: Number(it.c) || 0, f: Number(it.f) || 0
    });
    if (error) return;
    setAdded((s) => new Set(s).add(it.id));
    setLeft((l) => (l === null ? l : l - Math.round(Number(it.cal))));
  }

  return (
    <>
      {streak !== null ? (
        <section className="streak">
          <span aria-hidden="true">🔥</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            {streak > 0 ? <><b className="num">{streak}</b> <b>{streak === 1 ? "يوم" : "أيام"} ورا بعض</b></> : <b>ابدئي سلسلتك اليوم</b>}
            <small>{streak > 0 ? "سجلتي أكلك أو خلصتي وجباتك. كملي!" : "سجلي أكلك أو علمي على وجباتك، ويبدأ العداد."}</small>
          </span>
        </section>
      ) : null}
      {items.length && left !== null && left > 0 ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">🍔</span>
            <h2>طالع مطعم؟</h2>
            <span className="aside">يناسب الباقي لك ({left} سعرة)</span>
          </div>
          <section className="card" style={{ padding: "4px 16px" }}>
            {items.map((it) => (
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
      ) : null}
    </>
  );
}
