"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type RecRow = { id: string; week_end: string; recs: string[]; status: string };

/** Friday: this week's tips from the AI (asked once, then saved). */
export function useWeekRecs(week: Record<string, number | null> | null) {
  const [recs, setRecs] = useState<string[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "pending" | "none">("loading");
  const key = week ? JSON.stringify(week) : "";

  useEffect(() => {
    if (!key) return;
    let off = false;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return setState("none");
      try {
        const res = await fetch("/api/recs", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${s.session.access_token}` },
          body: JSON.stringify({ week: JSON.parse(key) })
        });
        const j = (await res.json()) as { recs?: string[]; status?: string };
        if (off) return;
        if (!res.ok || !j.recs || j.status === "rejected") return setState("none");
        if (j.status === "pending") return setState("pending");
        setRecs(j.recs);
        setState("ok");
      } catch {
        if (!off) setState("none");
      }
    })();
    return () => {
      off = true;
    };
  }, [key]);

  return { recs, state };
}

/** «تقدمي»: past weeks' tips. */
export function RecsHistory({ rows }: { rows: RecRow[] }) {
  if (!rows.length) return null;
  const fmt = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" }).format(new Date(d + "T12:00"));
  return (
    <details className="gsec">
      <summary>
        <span className="em" aria-hidden="true">💡</span>
        <span><b>توصيات الأسابيع</b><span className="sub">آخرها جمعة {fmt(rows[0].week_end)}</span></span>
      </summary>
      <div className="gbody stack">
        {rows.map((r) => (
          <div key={r.id}>
            <b className="small">جمعة {fmt(r.week_end)}</b>
            <ol className="recs-list">{r.recs.map((x) => <li key={x}>{x}</li>)}</ol>
          </div>
        ))}
      </div>
    </details>
  );
}
