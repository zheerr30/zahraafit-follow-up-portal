"use client";

import { useCallback, useEffect, useState } from "react";
import type { MealPlanData, WorkoutPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Client, Plan, Profile } from "@/lib/types";
import { currentPeriod, type PeriodLog } from "@/lib/period";
import { ramadanActive } from "@/lib/ramadan";

export type PlanRow = Plan & { url?: string };

const isDoc = (d: unknown) => Boolean(d && typeof d === "object" && (d as { format?: string }).format === "zahraafit-doc");

/** The signed-in subscriber's client record and her current plans. */
export function useClientPlans(profile: Profile | null) {
  const [client, setClient] = useState<Client | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [periods, setPeriods] = useState<PeriodLog[]>([]);
  const [ramadanUntil, setRamadanUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: c } = await supabase.from("clients").select("*").eq("profile_id", profile.id).maybeSingle();
    setClient((c as Client | null) || null);
    if (c) {
      const [{ data: p }, { data: pl }] = await Promise.all([
        supabase.from("plans").select("*").eq("client_id", c.id).eq("is_current", true).order("created_at", { ascending: true }),
        profile.gender === "male" ? Promise.resolve({ data: [] }) : supabase.from("period_logs").select("*").eq("client_id", c.id).order("start_date", { ascending: false }).limit(12)
      ]);
      setPeriods((pl as PeriodLog[] | null) || []);
      const { data: rp } = await supabase.from("reminder_prefs").select("ramadan_until").eq("profile_id", profile.id).maybeSingle();
      setRamadanUntil((rp as { ramadan_until?: string | null } | null)?.ramadan_until || null);
      const rows = (p as Plan[] | null) || [];
      setPlans(
        await Promise.all(
          rows.map(async (x) => {
            if (!x.file_path) return x;
            const { data: s } = await supabase.storage.from("client-plans").createSignedUrl(x.file_path, 60 * 60);
            return { ...x, url: s?.signedUrl };
          })
        )
      );
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  // Special plans (period days, Ramadan) replace the regular one while they apply.
  const period = profile?.gender === "male" ? null : currentPeriod(periods);
  const ramadan = ramadanActive(ramadanUntil);
  const pick = (kind: string) => {
    const rows = plans.filter((p) => p.kind === kind && p.data);
    const special = (period ? rows.find((p) => p.variant === "period") : undefined) || (ramadan ? rows.find((p) => p.variant === "ramadan") : undefined);
    return special || rows.find((p) => !p.variant) || null;
  };
  const mealRow = pick("nutrition");
  const workoutRow = pick("workout");
  return {
    client,
    plans,
    files: plans.filter((p) => p.url),
    /** Everything she can save as PDF: uploaded files and the generator's designed documents. */
    pdfs: plans
      .filter((p) => p.url || isDoc(p.data))
      .map((p) => ({ id: p.id, title: p.title.replace(/\s*\(PDF\)$/, ""), href: p.url || `/app/print/${p.id}`, external: Boolean(p.url), kind: p.kind })),
    mealRow,
    meal: (mealRow?.data as MealPlanData | undefined) || null,
    workoutRow,
    workout: (workoutRow?.data as WorkoutPlanData | undefined) || null,
    periods,
    /** She is on her period today. */
    period,
    /** Ramadan mode is on. */
    ramadan,
    loading,
    reload: load
  };
}
