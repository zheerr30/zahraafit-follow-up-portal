"use client";

import type { BaseFood } from "@/lib/foods";
import { supabase } from "@/lib/supabase";

let cache: BaseFood[] | null = null;

/** The generator's ingredient list (per 100 g), loaded once per visit. */
export async function loadBase(): Promise<BaseFood[]> {
  if (cache) return cache;
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/foods", { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` } });
  if (!res.ok) return [];
  cache = (await res.json()) as BaseFood[];
  return cache;
}
