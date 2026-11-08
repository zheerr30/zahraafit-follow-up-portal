import { addDays } from "@/lib/followup";
import { todayKey } from "@/lib/plan-data";

export type PeriodLog = { id: string; client_id: string; start_date: string; end_date: string | null };

/** A period still open after this many days counts as over (she forgot to end it). */
export const MAX_DAYS = 10;

export const periodEnd = (p: PeriodLog) => p.end_date || addDays(p.start_date, MAX_DAYS - 1);

/** Is this date inside one of her periods? */
export function inPeriod(logs: PeriodLog[], day: string) {
  return logs.some((p) => p.start_date <= day && day <= periodEnd(p));
}

/** The period she is in now: started and not ended yet (once she taps «خلصت الدورة» it's over, even if it ended today). */
export function currentPeriod(logs: PeriodLog[], today = todayKey()) {
  return logs.find((p) => !p.end_date && p.start_date <= today && today <= periodEnd(p)) || null;
}
