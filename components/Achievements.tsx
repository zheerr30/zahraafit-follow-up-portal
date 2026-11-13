"use client";

import { isOff, loadOff } from "@/lib/off-days";
import { SecH } from "@/components/SecH";
import { useEffect, useState } from "react";
import { ShareSheet } from "@/components/ShareSheet";
import type { ShareCard } from "@/lib/share-card";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

/** Days in a row (up to today, or yesterday if today isn't logged yet) with meals ticked or food logged. */
export async function streakDays(clientId: string) {
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
  // Off days neither add to the streak nor break it.
  const off = await loadOff(clientId, from);
  const key = (x: Date) => x.toISOString().slice(0, 10);
  const t = new Date(todayKey() + "T12:00:00");
  if (!days.has(key(t))) t.setDate(t.getDate() - 1);
  let n = 0;
  for (let i = 0; i < 92; i++) {
    const k = key(t);
    if (isOff(off, k) && !days.has(k)) {
      t.setDate(t.getDate() - 1);
      continue;
    }
    if (!days.has(k)) break;
    if (!isOff(off, k)) n++;
    t.setDate(t.getDate() - 1);
  }
  return n;
}

/** «🏆 إنجازاتك» in «تقدمي», each with a share button. Weight stays hidden unless she shows it. */
export function Achievements({ clientId, plateCard = null, pr = null }: { clientId: string; plateCard?: ShareCard | null; pr?: { name: string; w: number } | null }) {
  const [streak, setStreak] = useState(0);
  const [share, setShare] = useState<{ card: ShareCard; toggle: boolean } | null>(null);
  useEffect(() => {
    streakDays(clientId).then(setStreak);
  }, [clientId]);

  const items: { em: string; title: string; sub: string; card: ShareCard; toggle: boolean }[] = [];
  // Streak milestones: 7, 14, 30 days.
  const ms = [30, 14, 7].find((m) => streak >= m);
  if (ms) items.push({ em: "🔥", title: `${ms} يوم ورا بعض`, sub: `التزمتي بتسجيل أكلك ${streak} يوم ورا بعض`, card: { kind: "streak", days: streak }, toggle: false });
  if (pr) items.push({ em: "🏋️", title: `وزن جديد في ${pr.name}`, sub: `رفعتي ${pr.w} كجم، أعلى من أي مرة قبل`, card: { kind: "workout", title: pr.name, min: 0, sets: 0, vol: 0, primary: [], secondary: [], prs: [pr] }, toggle: false });
  if (plateCard) items.push({ em: "🍽️", title: "صحن كامل", sub: "يوم كامل على هدفك هالأسبوع", card: plateCard, toggle: false });
  if (!items.length) {
    return (
      <>
        <SecH icon="trophy" title="إنجازاتك" />
        <section className="card empty-mini">
          <p className="small muted">إنجازاتك تطلع هنا: 7 أيام ورا بعض، أول صحن كامل، وأي وزن جديد ترفعينه في تمارينك. أول خطوة: سجلي أكلك اليوم.</p>
          <a className="btn btn-s btn-sm" href="/app/food">سجلي أكلك اليوم</a>
        </section>
      </>
    );
  }

  return (
    <>
      <SecH icon="trophy" title="إنجازاتك" />
      <section className="card stack" style={{ gap: 0, padding: "4px 16px" }}>
        {items.map((it) => (
          <div key={it.title} className="diary-row">
            <span className="emo" aria-hidden="true">{it.em}</span>
            <span style={{ minWidth: 0 }}>
              <b>{it.title}</b>
              <span className="note" style={{ display: "block" }}>{it.sub}</span>
            </span>
            <button type="button" className="share-btn" style={{ margin: 0, flex: "none" }} onClick={() => setShare({ card: it.card, toggle: it.toggle })}>شاركي</button>
          </div>
        ))}
      </section>
      {share ? <ShareSheet card={share.card} onClose={() => setShare(null)} /> : null}
    </>
  );
}
