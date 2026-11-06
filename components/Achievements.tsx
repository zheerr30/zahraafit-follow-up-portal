"use client";

import { useEffect, useState } from "react";
import { ShareSheet } from "@/components/ShareSheet";
import type { ShareCard } from "@/lib/share-card";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

/** Days in a row (up to today, or yesterday if today isn't logged yet) with meals ticked or food logged. */
async function streakDays(clientId: string) {
  const since = new Date(todayKey() + "T12:00:00");
  since.setDate(since.getDate() - 90);
  const from = since.toISOString().slice(0, 10);
  const [{ data: d }, { data: e }] = await Promise.all([
    supabase.from("daily_logs").select("log_date, meals").eq("client_id", clientId).gte("log_date", from),
    supabase.from("food_entries").select("log_date").eq("client_id", clientId).gte("log_date", from)
  ]);
  const days = new Set<string>();
  ((d as { log_date: string; meals: Record<string, unknown> }[] | null) || []).forEach((x) => {
    if (Object.entries(x.meals || {}).some(([k, v]) => v === true && (/^\d+-\d+$/.test(k) || k.startsWith("x-")))) days.add(x.log_date);
  });
  ((e as { log_date: string }[] | null) || []).forEach((x) => days.add(x.log_date));
  const t = new Date(todayKey() + "T12:00:00");
  if (!days.has(t.toISOString().slice(0, 10))) t.setDate(t.getDate() - 1);
  let n = 0;
  while (days.has(t.toISOString().slice(0, 10))) {
    n++;
    t.setDate(t.getDate() - 1);
  }
  return n;
}

/** «🏆 إنجازاتك» in «تقدمي», each with a share button. Weight stays hidden unless she shows it. */
export function Achievements({ clientId, lost }: { clientId: string; lost: number | null }) {
  const [streak, setStreak] = useState(0);
  const [share, setShare] = useState<{ card: ShareCard; toggle: boolean } | null>(null);
  useEffect(() => {
    streakDays(clientId).then(setStreak);
  }, [clientId]);

  const items: { em: string; title: string; sub: string; card: ShareCard; toggle: boolean }[] = [];
  if (streak >= 2) items.push({ em: "🔥", title: `${streak} أيام ورا بعض`, sub: "التزمتي بتسجيل أكلك", card: { kind: "streak", days: streak }, toggle: false });
  if (lost !== null && lost >= 0.5) items.push({ em: "🏆", title: `نزلتي ${Math.round(lost * 10) / 10} كيلو`, sub: "من أول وزن سجلتيه", card: { kind: "weight", lost, show: false }, toggle: true });
  if (!items.length) return null;

  return (
    <>
      <div className="sec-h"><h2>🏆 إنجازاتك</h2></div>
      <section className="card stack" style={{ gap: 0, padding: "4px 16px" }}>
        {items.map((it) => (
          <div key={it.title} className="diary-row">
            <span aria-hidden="true" style={{ fontSize: 26, flex: "none" }}>{it.em}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ color: "var(--navy)" }}>{it.title}</b>
              <span className="note" style={{ display: "block" }}>{it.sub}</span>
            </span>
            <button type="button" className="share-btn" style={{ margin: 0, flex: "none" }} onClick={() => setShare({ card: it.card, toggle: it.toggle })}>📤 شاركي</button>
          </div>
        ))}
      </section>
      {share ? <ShareSheet card={share.card} numberToggle={share.toggle} onClose={() => setShare(null)} /> : null}
    </>
  );
}
