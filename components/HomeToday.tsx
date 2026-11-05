"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { todayKey, waterCups, type MealPlanData, type WorkoutPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

/** "Your day" cards on the home screen: food, next workout, water, weight. */
export function HomeToday({ clientId, plans }: { clientId: string; plans: Plan[] }) {
  const mealRow = plans.find((p) => p.kind === "nutrition" && p.data);
  const workRow = plans.find((p) => p.kind === "workout" && p.data);
  const meal = mealRow?.data as MealPlanData | undefined;
  const work = workRow?.data as WorkoutPlanData | undefined;
  const [eaten, setEaten] = useState(0);
  const [water, setWater] = useState(0);
  const [nextDay, setNextDay] = useState<string | null>(null);
  const [weight, setWeight] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: w }, { data: b }] = await Promise.all([
        supabase.from("daily_logs").select("meals, water").eq("client_id", clientId).eq("log_date", todayKey()).maybeSingle(),
        supabase.from("workout_logs").select("plan_id, day_index").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("body_logs").select("weight_kg").eq("client_id", clientId).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle()
      ]);
      if (d) {
        setEaten(Object.entries((d.meals || {}) as Record<string, unknown>).filter(([k, v]) => /^\d+-\d+$/.test(k) && v === true).length);
        setWater(d.water || 0);
      }
      if (work) {
        const idx = w && w.plan_id === workRow?.id ? (w.day_index + 1) % work.days.length : 0;
        setNextDay(work.days[idx]?.title || null);
      }
      if (b?.weight_kg) setWeight(Number(b.weight_kg));
    })();
  }, [clientId, work, workRow?.id]);

  const dayIdx = meal && mealRow ? Math.max(0, Math.floor((Date.now() - new Date(mealRow.created_at).getTime()) / 864e5)) % meal.days.length : 0;
  const mealsToday = meal ? meal.days[dayIdx]?.meals.length || 0 : 0;

  const cards = [
    meal && { href: "/app/food", em: "🍽️", label: "أكل اليوم", value: `${eaten} من ${mealsToday}`, sub: "وجبات أكلتيها" },
    work && { href: "/app/workout", em: "💪", label: "تمرينك الجاي", value: nextDay || "—", sub: "اضغطي وابدئي" },
    meal && { href: "/app/food", em: "💧", label: "الماء", value: `${water} من ${waterCups(weight)}`, sub: "أكواب ماء اليوم" },
    { href: "/app/progress", em: "⚖️", label: "وزنك", value: weight ? `${weight} كجم` : "سجّليه", sub: weight ? "آخر وزن" : "من «تقدّمي»" }
  ].filter(Boolean) as { href: string; em: string; label: string; value: string; sub: string }[];

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">☀️</span>
        <h2>يومك</h2>
      </div>
      <div className="grid2">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="row between small muted">
              <span>
                <span aria-hidden="true" style={{ marginInlineEnd: 6 }}>{c.em}</span>
                {c.label}
              </span>
              <ChevronLeft size={16} />
            </span>
            <b style={{ fontSize: 17, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.value}</b>
            <span className="note">{c.sub}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
