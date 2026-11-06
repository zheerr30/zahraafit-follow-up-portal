"use client";

import { useEffect, useState } from "react";
import { dayName } from "@/lib/followup";
import { supabase } from "@/lib/supabase";

type Row = { id: string; week_date: string; coach_notes: string };

/** «تقدمي»: the coach's replies to her weekly check-ins. */
export function CoachMessages({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("weekly_followups").select("id, week_date, coach_notes").eq("client_id", clientId).not("coach_notes", "is", null).order("week_date", { ascending: false }).limit(8)
      .then(({ data }) => setRows((data as Row[] | null) || []));
  }, [clientId]);
  if (!rows.length) return null;
  return (
    <>
      <div className="sec-h"><h2>💬 رسائل المدربة</h2></div>
      {rows.map((r, i) => (
        <details key={r.id} className="gsec" open={i === 0}>
          <summary>
            <span className="em" aria-hidden="true">💬</span>
            <span><b>أسبوع {dayName(r.week_date)}</b><span className="sub">{r.coach_notes.slice(0, 50)}{r.coach_notes.length > 50 ? "…" : ""}</span></span>
          </summary>
          <div className="gbody"><p className="small" style={{ whiteSpace: "pre-line" }}>{r.coach_notes}</p></div>
        </details>
      ))}
    </>
  );
}
