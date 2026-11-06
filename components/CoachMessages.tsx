"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { markReplySeen } from "@/components/HomeDashboard";

type Row = { id: string; week_date: string; coach_notes: string; coach_replied_at: string | null; updated_at?: string | null };

const sent = (r: Row) => formatDate(r.coach_replied_at || r.updated_at || r.week_date);

/** «تقدمي»: the coach's replies to her weekly check-ins. The latest is open; older ones are folded. */
export function CoachMessages({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    supabase.from("weekly_followups").select("*").eq("client_id", clientId).not("coach_notes", "is", null).order("week_date", { ascending: false }).limit(8)
      .then(({ data }) => {
        const list = ((data as Row[] | null) || []).filter((r) => r.coach_notes?.trim());
        setRows(list);
        setLoaded(true);
        // Seeing it here counts as read: the home banner goes away.
        if (list[0]) markReplySeen(list[0].id);
        if (list[0] && window.location.hash === "#coach-msg") setTimeout(() => document.getElementById("coach-msg")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      });
  }, [clientId]);
  if (!loaded) return null;
  if (!rows.length) {
    return (
      <>
        <div className="sec-h" id="coach-msg"><h2>💬 رسالة المدربة</h2></div>
        <section className="card empty-mini">
          <p className="small muted">ردود المدربة زهراء على تسجيلك الأسبوعي تطلع هنا. أول خطوة: سجلي تسجيلك يوم السبت.</p>
          <a className="btn btn-s btn-sm" href="/app/checkin">التسجيل الأسبوعي</a>
        </section>
      </>
    );
  }
  const [last, ...old] = rows;
  return (
    <>
      <div className="sec-h" id="coach-msg" style={{ scrollMarginTop: 80 }}><h2>💬 رسالة المدربة</h2></div>
      <section className="card stack coach-msg">
        <span className="small muted">وصلتك {sent(last)}</span>
        <p style={{ whiteSpace: "pre-line", margin: 0 }}>{last.coach_notes}</p>
      </section>
      {old.map((r) => (
        <details key={r.id} className="gsec msg-old">
          <summary>
            <span className="em" aria-hidden="true">💬</span>
            <span><b>{sent(r)}</b><span className="sub">{r.coach_notes.replace(/\s+/g, " ").slice(0, 50).replace(/[.،]+$/, "")}{r.coach_notes.length > 50 ? "…" : ""}</span></span>
          </summary>
          <div className="gbody"><p className="small" style={{ whiteSpace: "pre-line", margin: 0 }}>{r.coach_notes}</p></div>
        </details>
      ))}
    </>
  );
}
