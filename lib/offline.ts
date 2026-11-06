"use client";

import { supabase } from "@/lib/supabase";

// Saves that must not get lost without internet (water, ticked meals, weight).
// When offline, the row is kept on the phone and sent as soon as the internet is back.
// Saves for the same row are merged; the newest value of each field wins.

type Op = { key: string; table: string; row: Record<string, unknown>; onConflict: string; at: number };
const KEY = "zf-offline-queue";

function read(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Op[];
  } catch {
    return [];
  }
}
function write(ops: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {}
  window.dispatchEvent(new Event("zf-queue"));
}
export const pendingCount = () => (typeof window === "undefined" ? 0 : read().length);

const isNetwork = (msg?: string) => !navigator.onLine || /fetch|network|load failed|timeout/i.test(msg || "");

/** Upsert now, or keep it on the phone if there's no internet. */
export async function saveRow(table: string, row: Record<string, unknown>, onConflict: string): Promise<{ ok: boolean; queued: boolean }> {
  const key = `${table}:${onConflict.split(",").map((c) => String(row[c.trim()])).join("|")}`;
  const queue = () => {
    const old = read().find((o) => o.key === key);
    // two saves for the same row (weight, then a measurement) are merged
    write([...read().filter((o) => o.key !== key), { key, table, row: { ...(old?.row || {}), ...row }, onConflict, at: Date.now() }]);
    return { ok: true, queued: true };
  };
  if (!navigator.onLine) return queue();
  try {
    const { error } = await supabase.from(table).upsert(row, { onConflict });
    if (!error) {
      // fields just saved win over older ones still waiting for the same row
      const old = read().find((o) => o.key === key);
      if (old) {
        const conflict = onConflict.split(",").map((c) => c.trim());
        const left = Object.fromEntries(Object.entries(old.row).filter(([k]) => conflict.includes(k) || !(k in row)));
        const rest = read().filter((o) => o.key !== key);
        write(Object.keys(left).length > conflict.length ? [...rest, { ...old, row: left }] : rest);
      }
      return { ok: true, queued: false };
    }
    return isNetwork(error.message) ? queue() : { ok: false, queued: false };
  } catch (e) {
    return isNetwork((e as Error).message) ? queue() : { ok: false, queued: false };
  }
}

let flushing = false;
/** Sends what was saved offline. Called when the internet comes back and when the app opens. */
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const op of read().sort((a, b) => a.at - b.at)) {
      try {
        const { error } = await supabase.from(op.table).upsert(op.row, { onConflict: op.onConflict });
        if (error && isNetwork(error.message)) break;
        // sent, or refused for good (don't retry forever)
        write(read().filter((o) => !(o.key === op.key && o.at === op.at)));
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
