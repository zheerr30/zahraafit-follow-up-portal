// Working days are Sunday to Thursday (Saudi week). Dates are taken in Riyadh time.

const OFF_DAYS = new Set([5, 6]); // Friday, Saturday

function riyadhDate(value: Date | string = new Date()) {
  const d = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  return new Date(`${parts}T12:00:00`);
}

export function addBusinessDays(start: Date | string, days: number) {
  const d = riyadhDate(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (!OFF_DAYS.has(d.getDay())) added += 1;
  }
  return d;
}

/** Whole working days between two moments (0 if the same day). */
export function businessDaysBetween(from: Date | string, to: Date | string = new Date()) {
  const a = riyadhDate(from);
  const b = riyadhDate(to);
  let count = 0;
  while (a < b) {
    a.setDate(a.getDate() + 1);
    if (!OFF_DAYS.has(a.getDay())) count += 1;
  }
  return count;
}

export function formatDay(d: Date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** "between Sunday 9 Nov and Monday 10 Nov" for a request submitted at `submittedAt`. */
export function deliveryWindow(submittedAt: string) {
  return { from: addBusinessDays(submittedAt, 2), to: addBusinessDays(submittedAt, 3) };
}
