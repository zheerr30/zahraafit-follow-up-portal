"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { saveRow } from "@/lib/offline";
import { todayKey } from "@/lib/plan-data";
import { track } from "@/components/AppStatus";

/** Adds one cup of water to today, from anywhere. Screens that show water reload on «zf-data». */
export async function addWaterCup(): Promise<number | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data: c } = await supabase.from("clients").select("id").eq("profile_id", u.user.id).maybeSingle();
  if (!c) return null;
  const today = todayKey();
  const { data: dl } = await supabase.from("daily_logs").select("meals, water").eq("client_id", c.id).eq("log_date", today).maybeSingle();
  const water = Math.min(20, ((dl as { water?: number } | null)?.water || 0) + 1);
  await saveRow("daily_logs", { client_id: c.id, log_date: today, meals: (dl as { meals?: unknown } | null)?.meals || {}, water }, "client_id,log_date");
  track("water:add");
  window.dispatchEvent(new Event("zf-data"));
  return water;
}

/** The round «+» beside the tab bar: log food, a cup of water, today's weight. */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const close = () => { setOpen(false); setMsg(""); };
  return (
    <>
      <button type="button" className="fab" aria-label="أضيفي" aria-expanded={open} onClick={() => setOpen(true)}><Plus /></button>
      {open ? (
        <div className="qa-bg" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="qa" role="dialog" aria-modal="true" aria-label="أضيفي">
            <div className="qa-grip" aria-hidden="true" />
            <h2>وش تبين تسجلين؟</h2>
            <Link className="qa-row" href="/app/food?tab=diary" onClick={close}>
              <span className="emo" aria-hidden="true">🍽️</span>
              <span className="qa-mid">سجلي أكل<small>بحث، باركود، صورة صحنك، مطاعم</small></span>
              <ChevronLeft size={18} />
            </Link>
            <button type="button" className="qa-row" onClick={async () => {
              const w = await addWaterCup();
              setMsg(w === null ? "ما انحفظ، جربي مرة ثانية" : `انضاف كوب، صرتي ${w} أكواب اليوم`);
              setTimeout(close, 1200);
            }}>
              <span className="emo" aria-hidden="true">💧</span>
              <span className="qa-mid">كوب ماء<small>{msg || "ينضاف على طول"}</small></span>
              <Plus size={18} />
            </button>
            <Link className="qa-row" href="/app/progress?weight=1" onClick={close}>
              <span className="emo" aria-hidden="true">⚖️</span>
              <span className="qa-mid">وزن اليوم<small>الصبح بعد الحمام وقبل الأكل</small></span>
              <ChevronLeft size={18} />
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
