"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addDays } from "@/lib/followup";
import type { DayNumbers, SummaryCard } from "@/lib/day-summary";

/**
 * Keeps today's numbers (as this screen shows them) in day_stats, for the end-of-day
 * summary at night. Saves a second after the numbers stop changing; nothing on screen.
 */
export function DayStatsSync({ clientId, day, n }: { clientId: string; day: string; n: DayNumbers }) {
  const last = useRef("");
  const row = {
    client_id: clientId,
    day,
    cal: Math.round(n.cal * 10) / 10,
    p: Math.round(n.p * 10) / 10,
    c: Math.round(n.c * 10) / 10,
    f: Math.round(n.f * 10) / 10,
    target_cal: n.target_cal ? Math.round(n.target_cal) : null,
    target_p: n.target_p ? Math.round(n.target_p) : null,
    water: Math.min(40, n.water),
    water_goal: n.water_goal ? Math.min(40, n.water_goal) : null,
    meals_done: Math.min(20, n.meals_done),
    meals_total: Math.min(20, n.meals_total)
  };
  const key = JSON.stringify(row);
  useEffect(() => {
    if (key === last.current) return;
    const t = setTimeout(() => {
      last.current = key;
      supabase.from("day_stats").upsert({ ...JSON.parse(key), updated_at: new Date().toISOString() }, { onConflict: "client_id,day" }).then(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [key]);
  return null;
}

type Row = { day: string; kind: "summary" | "excellent" | "nolog"; push: string; card: SummaryCard | Record<string, never> };

const riyadhHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", hourCycle: "h23" }).format(new Date()));
const seenKey = (day: string) => `zf-sum-${day}`;

/** «ملخص يومك» on home: tonight's summary (and last night's until noon). Opened by the notification (?summary=1). */
export function DaySummaryCard({ profileId, today }: { profileId: string; today: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const fromPush = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("summary") === "1";
    const days = riyadhHour() < 12 ? [today, addDays(today, -1)] : [today];
    supabase
      .from("day_summaries")
      .select("day, kind, push, card")
      .eq("profile_id", profileId)
      .in("day", days)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as Row | null;
        if (!r) return;
        let seen = false;
        try { seen = localStorage.getItem(seenKey(r.day)) === "1"; } catch {}
        if (seen && !fromPush) return;
        setRow(r);
        if (fromPush) setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
      });
  }, [profileId, today]);

  if (!row || hidden) return null;
  const c = row.card as Partial<SummaryCard>;
  const hide = Boolean(c.hide);
  const close = () => {
    try { localStorage.setItem(seenKey(row.day), "1"); } catch {}
    setHidden(true);
  };

  return (
    <section ref={ref} className="card sum-card" aria-label="ملخص يومك">
      <div className="sum-head">
        <span className="sum-kicker">{row.day === today ? "ملخص يومك" : "ملخص أمس"}</span>
        <button type="button" className="icon-btn" aria-label="إخفاء الملخص" onClick={close}><X size={16} /></button>
      </div>
      <p className="sum-lead">{row.push}</p>

      {row.kind === "nolog" ? (
        <Link href="/app/food?tab=diary" className="btn btn-p btn-block">سجلي أكلك</Link>
      ) : (
        <>
          <div className="sum-body">
            <Plate plate={c.plate || null} hide={hide} />
            <div className="sum-rows">
              <Line label="قوة" sub="البروتين" v={c.strength ?? null} text={!hide && c.nums?.target_p ? `${c.nums.p} من ${c.nums.target_p} جرام` : null} />
              <Line label="توازن" sub="السعرات على هدفك" v={c.balance ?? null} off="بعيد عن الهدف" text={!hide && c.nums?.target_cal ? `${c.nums.cal.toLocaleString("en-US")} من ${c.nums.target_cal.toLocaleString("en-US")}` : null} />
              <Line label="بساطة" sub="الماء ووجباتك" v={c.simple ?? null} text={!hide && c.nums ? `${c.nums.water} من ${c.nums.water_goal} أكواب` : null} />
            </div>
          </div>
          {c.rec ? (
            <div className="sum-rec">
              <b>لبكرا</b>
              <p>{c.rec}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Line({ label, sub, v, text, off = "أقل من الهدف" }: { label: string; sub: string; v: number | null; text: string | null; off?: string }) {
  const pct = v === null ? 0 : Math.max(0, Math.min(1, v));
  const good = v !== null && v >= 0.85;
  return (
    <div className="sum-line">
      <span className="sum-l"><b>{label}</b><small>{sub}</small></span>
      <span className="sum-bar" aria-hidden="true"><i className={good ? "good" : ""} style={{ width: `${Math.round(pct * 100)}%` }} /></span>
      <span className="sum-v num">{v === null ? "ما فيه هدف" : text || (good ? "على الهدف" : off)}</span>
    </div>
  );
}

/** The plate: today's calories split by protein, carbs and fat. */
function Plate({ plate, hide }: { plate: { p: number; c: number; f: number } | null; hide: boolean }) {
  const parts = plate ? [
    { k: "بروتين", v: plate.p, color: "var(--navy)" },
    { k: "كارب", v: plate.c, color: "var(--clay)" },
    { k: "دهون", v: plate.f, color: "var(--navy-soft)" }
  ] : [];
  const R = 34, C = 2 * Math.PI * R;
  let at = 0;
  return (
    <figure className="sum-plate" aria-label="صحنك اليوم">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
        {parts.map((x) => {
          const len = (x.v / 100) * C;
          const el = <circle key={x.k} cx="48" cy="48" r={R} fill="none" stroke={x.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-at} transform="rotate(-90 48 48)" />;
          at += len;
          return el;
        })}
      </svg>
      <figcaption>
        <b>الصحن</b>
        {parts.map((x) => (
          <span key={x.k}><i style={{ background: x.color }} />{x.k}{hide ? null : <em className="num"> {x.v}٪</em>}</span>
        ))}
      </figcaption>
    </figure>
  );
}
