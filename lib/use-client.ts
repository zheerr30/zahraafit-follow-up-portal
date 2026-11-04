"use client";

import { useCallback, useEffect, useState } from "react";
import type { MealPlanData, WorkoutPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Client, Plan, Profile } from "@/lib/types";

export type PlanRow = Plan & { url?: string };

const isDoc = (d: unknown) => Boolean(d && typeof d === "object" && (d as { format?: string }).format === "zahraafit-doc");

/** The signed-in subscriber's client record and her current plans. */
export function useClientPlans(profile: Profile | null) {
  const [client, setClient] = useState<Client | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: c } = await supabase.from("clients").select("*").eq("profile_id", profile.id).maybeSingle();
    setClient((c as Client | null) || null);
    if (c) {
      const { data: p } = await supabase.from("plans").select("*").eq("client_id", c.id).eq("is_current", true).order("created_at", { ascending: true });
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

  const mealRow = plans.find((p) => p.kind === "nutrition" && p.data) || null;
  const workoutRow = plans.find((p) => p.kind === "workout" && p.data) || null;
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
    loading,
    reload: load
  };
}
