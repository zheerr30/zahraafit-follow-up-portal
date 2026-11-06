"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type Row = { id: string; week_date: string; coach_notes: string; coach_replied_at: string | null; updated_at?: string | null };

const sent = (r: Row) => formatDate(r.coach_replied_at || r.updated_at || r.week_date);

/** «تقدمي»: the coach's replies to her weekly check-ins. The latest is open; older ones are folded. */
export function CoachMessages({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("weekly_followups").select("*").eq("client_id", clientId).not("coach_notes", "is", null).order("week_date", { ascending: false }).limit(8)
      .then(({ data }) => setRows(((data as Row[] | null) || []).filter((r) => r.coach_notes?.trim())));
  }, [clientId]);
  if (!rows.length) return null;
  const [last, ...old] = rows;
  return (
    <>
      <div className="sec-h"><h2>💬 رسالة المدربة</h2></div>
      <section className="card stack coach-msg">
        <span className="small muted">وصلتك {sent(last)}</span>
        <p style={{ whiteSpace: "pre-line", margin: 0 }}>{last.coach_notes}</p>
      </section>
      {old.map((r) => (
        <details key={r.id} className="gsec msg-old">
          <summary>
            <span className="em" aria-hidden="true">💬</span>
            <span><b>{sent(r)}</b><span className="sub">{r.coach_notes.slice(0, 50)}{r.coach_notes.length > 50 ? "…" : ""}</span></span>
          </summary>
          <div className="gbody"><p className="small" style={{ whiteSpace: "pre-line", margin: 0 }}>{r.coach_notes}</p></div>
        </details>
      ))}
    </>
  );
}
