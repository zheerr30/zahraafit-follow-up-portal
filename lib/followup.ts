import { todayKey } from "@/lib/plan-data";
import type { Client } from "@/lib/types";

/** Days between two "YYYY-MM-DD" dates (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);
}

export function addDays(d: string, n: number) {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

export type FollowupInfo = {
  /** Has a follow-up subscription set by the coach. */
  has: boolean;
  active: boolean;
  ended: boolean;
  start: string;
  weeks: number;
  end: string;
  daysLeft: number;
  /** Week she is in now (1-based, capped). */
  week: number;
  /** The check-in that can be filled now (its week_date), or null if it's not time yet. */
  openDate: string | null;
  openWeek: number | null;
  /** Next check-in day if none is open. */
  nextDate: string | null;
};

/**
 * Check-ins are due every 7 days from the start (start+7, start+14, ...).
 * One can be filled from 2 days before its day until the next one opens.
 * The database reminder (push_due) uses the same days.
 */
export function followupInfo(c: Pick<Client, "followup_start" | "followup_weeks"> | null | undefined, today = todayKey()): FollowupInfo {
  const none: FollowupInfo = { has: false, active: false, ended: false, start: "", weeks: 0, end: "", daysLeft: 0, week: 0, openDate: null, openWeek: null, nextDate: null };
  if (!c?.followup_start || !c.followup_weeks) return none;
  const start = c.followup_start;
  const weeks = c.followup_weeks;
  const end = addDays(start, weeks * 7);
  const d = daysBetween(start, today);
  const ended = d > weeks * 7 + 4;
  const k = Math.floor((d + 2) / 7);
  const open = k >= 1 && k <= weeks && d >= 0;
  return {
    has: true,
    active: d >= 0 && !ended,
    ended,
    start,
    weeks,
    end,
    daysLeft: Math.max(0, daysBetween(today, end)),
    week: Math.min(weeks, Math.max(1, Math.floor(d / 7) + 1)),
    openDate: open ? addDays(start, k * 7) : null,
    openWeek: open ? k : null,
    nextDate: k < weeks ? addDays(start, Math.max(1, k + 1) * 7) : null
  };
}

export const FEELINGS = ["😣", "😕", "😐", "🙂", "🤩"];
export const FEELING_LABEL = ["تعبانة", "مو مرة", "عادي", "زين", "ممتاز"];
export const COMMIT_LABEL = ["ما التزمت", "قليل", "نص نص", "ملتزمة أغلب الوقت", "ملتزمة ١٠٠٪"];

export const dayName = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00"));

/** Shrinks a photo before upload (long side 1280 px, JPEG). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("photo"))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}
