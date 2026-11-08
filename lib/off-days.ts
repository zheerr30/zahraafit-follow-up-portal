"use client";

import { addDays } from "@/lib/followup";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

// Off days: a day without counting calories. Food logged that day is kept, but it
// isn't counted in averages, the weekly summary, the progress chart or the streak.
// Days come from her own picks (off_days) and the coach's fixed weekly free day.

export type OffInfo = { days: Set<string>; weekday: number | null; limit: number };
export const NO_OFF: OffInfo = { days: new Set(), weekday: null, limit: 1 };
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const dow = (d: string) => new Date(d + "T12:00:00").getDay();
/** Saturday that starts the week of a day. */
export const weekStart = (d: string) => addDays(d, -((dow(d) + 1) % 7));

export function isOff(info: OffInfo | null | undefined, day: string) {
  if (!info) return false;
  return info.days.has(day) || (info.weekday !== null && dow(day) === info.weekday);
}

/** Her off days from `from` on (and the coach's settings). */
export async function loadOff(clientId: string, from = addDays(todayKey(), -100)): Promise<OffInfo> {
  const [{ data: rows, error }, { data: c }] = await Promise.all([
    supabase.from("off_days").select("day").eq("client_id", clientId).gte("day", from),
    supabase.from("clients").select("off_limit, off_weekday").eq("id", clientId).maybeSingle()
  ]);
  if (error) return NO_OFF;
  const cc = (c as { off_limit?: number | null; off_weekday?: number | null } | null) || {};
  return { days: new Set(((rows as { day: string }[] | null) || []).map((r) => r.day)), weekday: cc.off_weekday ?? null, limit: cc.off_limit ?? 1 };
}

/** Off days used in the week of `day` (her picks + the plan's free day). */
export function usedInWeek(info: OffInfo, day: string) {
  const ws = weekStart(day);
  const picked = Array.from(info.days).filter((d) => weekStart(d) === ws).length;
  return picked + (info.weekday !== null ? 1 : 0);
}

export async function setOff(day: string): Promise<string | null> {
  const { error } = await supabase.rpc("set_off_day", { p_day: day });
  if (!error) return null;
  if (/limit/.test(error.message)) return "خلصتي أيام الأوف لهالأسبوع.";
  if (/already/.test(error.message)) return "هاليوم أصلا يوم حر في خطتك.";
  if (/date/.test(error.message)) return "اختاري اليوم أو يوم جاي (خلال شهر).";
  if (error.code === "PGRST202") return "أيام الأوف تشتغل قريب.";
  return "ما انحفظ. تأكدي من الاتصال وجربي مرة ثانية.";
}

export async function cancelOff(day: string): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_off_day", { p_day: day });
  if (!error) return null;
  return /started/.test(error.message) ? "ما تقدرين تلغين يوم أوف بدأ." : "ما انلغى. جربي مرة ثانية.";
}
