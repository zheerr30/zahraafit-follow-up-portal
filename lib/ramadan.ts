import { addDays } from "@/lib/followup";
import { todayKey } from "@/lib/plan-data";

const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { month: "numeric", day: "numeric", timeZone: "Asia/Riyadh" });

/** Hijri month and day (Umm al-Qura) of a "YYYY-MM-DD" date. */
export function hijri(day: string) {
  const parts = fmt.formatToParts(new Date(day + "T12:00:00"));
  return { m: Number(parts.find((p) => p.type === "month")?.value), d: Number(parts.find((p) => p.type === "day")?.value) };
}

export const isRamadanMonth = (day = todayKey()) => hijri(day).m === 9;

/** Ramadan mode ends after the third day of Eid; outside Ramadan it lasts 30 days. */
export function ramadanUntil(today = todayKey()) {
  if (hijri(today).m !== 9) return addDays(today, 30);
  let d = today;
  for (let i = 0; i < 40; i++) {
    d = addDays(d, 1);
    const h = hijri(d);
    if (h.m === 10 && h.d === 3) return d;
  }
  return addDays(today, 30);
}

export const ramadanActive = (until: string | null | undefined, today = todayKey()) => Boolean(until && until >= today);

/** Slot labels in Ramadan for the diary's stored slots. */
export const RAMADAN_SLOT: Record<string, string> = { فطور: "فطور", غداء: "وجبة بينية", عشاء: "سحور", سناك: "سناك" };
export const RAMADAN_EMOJI: Record<string, string> = { فطور: "🌙", غداء: "🥣", عشاء: "🌌", سناك: "🍎" };

/** Spreads a day's meals over Ramadan times: first فطور, last سحور, the rest وجبة بينية. */
export function ramadanMealSlot(index: number, count: number) {
  if (index === 0) return "فطور";
  if (index === count - 1 && count > 1) return "سحور";
  return "وجبة بينية";
}
