"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { dayName, followupInfo } from "@/lib/followup";
import { supabase } from "@/lib/supabase";
import type { Client, WeeklyFollowup } from "@/lib/types";

/** Home: where she is with this week's check-in. Only for follow-up subscribers. */
export function CheckinCard({ client }: { client: Client }) {
  const info = followupInfo(client);
  const [latest, setLatest] = useState<WeeklyFollowup | null | undefined>(undefined);

  useEffect(() => {
    if (!info.has) return;
    supabase.from("weekly_followups").select("*").eq("client_id", client.id).order("week_date", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLatest((data as WeeklyFollowup | null) || null));
  }, [client.id, info.has]);

  if (!info.has || latest === undefined) return null;
  const doneNow = info.openDate && latest?.week_date === info.openDate;
  const freshReply = latest?.coach_notes && latest.coach_replied_at && Date.now() - new Date(latest.coach_replied_at).getTime() < 5 * 864e5;

  let em = "📅", title = "", text = "", cls = "";
  if (info.ended) {
    em = "🌟"; title = "انتهت مدة متابعتك"; text = "تبين تكملين؟ جددي اشتراكك من المتجر.";
  } else if (info.openDate && !doneNow) {
    em = "📝"; title = `وقت متابعة الأسبوع ${info.openWeek}!`; text = "عبيها عشان المدربة تشوف أسبوعك وتعدل لك."; cls = "hot";
  } else if (freshReply) {
    em = "💬"; title = "المدربة ردت على متابعتك"; text = latest!.coach_notes!.slice(0, 90);
  } else if (doneNow) {
    em = "✅"; title = "وصلت متابعتك للمدربة"; text = "بترد عليك قريب.";
  } else {
    title = `الأسبوع ${info.week} من ${info.weeks}`; text = info.nextDate ? `متابعتك الجاية ${dayName(info.nextDate)}` : "";
  }

  return (
    <Link href="/app/checkin" className={`checkin-card ${cls}`}>
      <span className="em" aria-hidden="true">{em}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b>{title}</b>
        {text ? <span>{text}</span> : null}
      </span>
      <ChevronLeft size={18} style={{ flexShrink: 0 }} />
    </Link>
  );
}
