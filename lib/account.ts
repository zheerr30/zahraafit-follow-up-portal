import { daysBetween } from "@/lib/followup";
import { todayKey } from "@/lib/plan-data";
import type { Profile } from "@/lib/types";

export const STORE_URL = "https://zahraafit.com";

export type Account = {
  /** Has paid access right now. */
  sub: boolean;
  /** Had a subscription that ended (data kept, plan locked). */
  expired: boolean;
  end: string | null;
  /** Days until it ends (subscribers only). */
  daysLeft: number | null;
  credits: number;
};

/** Account type from the profile. Before phase13 is run every client counts as a subscriber. */
export function accountOf(p: Profile | null | undefined): Account {
  if (!p) return { sub: false, expired: false, end: null, daysLeft: null, credits: 0 };
  if (p.role === "admin") return { sub: true, expired: false, end: null, daysLeft: null, credits: 0 };
  if (p.account_type === undefined) return { sub: true, expired: false, end: null, daysLeft: null, credits: 0 };
  const end = p.subscription_end || null;
  const today = todayKey();
  const active = p.account_type === "subscriber" && (!end || end >= today);
  return {
    sub: active,
    expired: !active && Boolean(end),
    end,
    daysLeft: active && end ? daysBetween(today, end) : null,
    credits: p.photo_credits ?? 0
  };
}
