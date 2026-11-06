"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { STORE_URL } from "@/lib/account";
import { todayKey, waterCups } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

/** Home for a free account: today's calories, water, weight, and the plan offer. */
export function FreeHome({ clientId }: { clientId: string }) {
  const today = todayKey();
  const [eaten, setEaten] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [water, setWater] = useState(0);
  const [meals, setMeals] = useState<Record<string, unknown>>({});
  const [weight, setWeight] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: t }, { data: d }, { data: b }] = await Promise.all([
        supabase.from("food_entries").select("cal").eq("client_id", clientId).eq("log_date", today),
        supabase.from("food_targets").select("cal").eq("client_id", clientId).maybeSingle(),
        supabase.from("daily_logs").select("meals, water").eq("client_id", clientId).eq("log_date", today).maybeSingle(),
        supabase.from("body_logs").select("weight_kg").eq("client_id", clientId).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle()
      ]);
      setEaten(Math.round(((e as { cal: number }[] | null) || []).reduce((a, x) => a + Number(x.cal), 0)));
      setTarget((t as { cal: number } | null)?.cal || null);
      setWater(d?.water || 0);
      setMeals((d?.meals as Record<string, unknown>) || {});
      setWeight(b?.weight_kg ? Number(b.weight_kg) : null);
    })();
  }, [clientId, today]);

  async function addWater(n: number) {
    const next = Math.max(0, Math.min(20, water + n));
    setWater(next);
    await supabase.from("daily_logs").upsert({ client_id: clientId, log_date: today, meals, water: next }, { onConflict: "client_id,log_date" });
  }

  const cups = waterCups(weight);
  const left = target ? target - eaten : null;

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">☀️</span>
        <h2>يومك</h2>
      </div>
      <Link href="/app/food" className="today-card" style={{ display: "block" }}>
        <span className="row between">
          <span className="label">🔥 سعرات اليوم</span>
          <ChevronLeft size={18} />
        </span>
        <b className="num" style={{ fontSize: 30, color: "var(--navy)" }}>{left !== null ? (left >= 0 ? left : `+${-left}`) : eaten}</b>
        <span className="note" style={{ display: "block" }}>{left !== null ? (left >= 0 ? `باقي لك من ${target} سعرة` : "زيادة عن هدفك اليوم") : "سعرة أكلتيها اليوم"}</span>
      </Link>
      <div className="grid2">
        <section className="today-card">
          <span className="label">💧 الماء</span>
          <b className="num" style={{ fontSize: 26, color: "var(--navy)" }}>{water} <small style={{ fontSize: 13 }}>من {cups}</small></b>
          <span className="row" style={{ gap: 6, marginTop: 6 }}>
            <button type="button" className="btn btn-s btn-sm" style={{ flex: 1 }} aria-label="كوب ماء" onClick={() => addWater(1)}>+ كوب</button>
            <button type="button" className="btn btn-g btn-sm" aria-label="شيلي كوب" onClick={() => addWater(-1)} disabled={!water}>−</button>
          </span>
        </section>
        <Link href="/app/progress" className="today-card">
          <span className="row between"><span className="label">⚖️ وزنك</span><ChevronLeft size={18} /></span>
          <b className="num" style={{ fontSize: 26, color: "var(--navy)" }}>{weight ?? "—"} <small style={{ fontSize: 13 }}>كجم</small></b>
          <span className="note" style={{ display: "block" }}>سجلي وزنك كل أسبوع</span>
        </Link>
      </div>
      <a className="offer-card" href={STORE_URL} target="_blank" rel="noreferrer">
        <span aria-hidden="true" style={{ fontSize: 30 }}>🍽️</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <b>تبين خطة جاهزة على سعراتك؟</b>
          <span>وجبات من المدربة زهراء بكمياتها وبدائلها، وجدول تمارين يناسبك.</span>
        </span>
        <ChevronLeft size={18} />
      </a>
    </>
  );
}

/** Top-of-home notice: subscription ends within 5 days, or has ended. */
export function RenewBanner({ daysLeft, expired }: { daysLeft: number | null; expired: boolean }) {
  if (!expired && (daysLeft === null || daysLeft > 5)) return null;
  return (
    <section className={`renew ${expired ? "ended" : ""}`}>
      <b>{expired ? "⏳ انتهى اشتراكك" : daysLeft! <= 0 ? "⏳ اشتراكك ينتهي اليوم" : `⏳ باقي ${daysLeft} أيام على نهاية اشتراكك`}</b>
      <span>{expired ? "بياناتك وسجلك محفوظين. جددي عشان تفتح خطتك وتمارينك." : "جددي من المتجر عشان ما توقف خطتك ومتابعتك."}</span>
      <a className="btn btn-p btn-sm" href={STORE_URL} target="_blank" rel="noreferrer">جددي اشتراكك</a>
    </section>
  );
}
