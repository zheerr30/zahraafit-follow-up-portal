"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Inbox } from "lucide-react";
import { CoachShell, Empty, Loading } from "@/components/ui";
import { businessDaysBetween } from "@/lib/business-days";
import { normalizeAnswers, planTypeLabel } from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { PlanRequest } from "@/lib/types";

type Filter = "all" | "submitted" | "in_progress" | "unverified";
const FILTERS: [Filter, string][] = [
  ["all", "الكل"],
  ["submitted", "ما بديت"],
  ["in_progress", "شغالة عليها"],
  ["unverified", "الطلب ما تأكد"]
];

function waitInfo(r: PlanRequest) {
  const waited = businessDaysBetween(r.submitted_at);
  if (waited > 3) return { tone: "red", label: `متأخرة ${(waited - 3).toString()} يوم` };
  if (waited === 3) return { tone: "red", label: "اليوم آخر يوم" };
  if (waited === 2) return { tone: "amber", label: "باقي يوم" };
  return { tone: "", label: waited === 0 ? "وصلت اليوم" : "من يوم عمل" };
}

export default function CoachQueue() {
  const auth = useAuthGuard("admin");
  const [rows, setRows] = useState<PlanRequest[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!auth.profile) return;
      const { data, error: err } = await supabase
        .from("plan_requests")
        .select("*")
        .in("status", ["submitted", "in_progress"])
        .order("submitted_at", { ascending: true });
      if (err) setError("ما قدرنا نحمل الطلبات. جربي تحدثين الصفحة.");
      setRows((data as PlanRequest[] | null) || []);
      setLoading(false);
    }
    load();
  }, [auth.profile]);

  const shown = useMemo(
    () => rows.filter((r) => (filter === "all" ? true : filter === "unverified" ? !r.order_verified : r.status === filter)),
    [rows, filter]
  );

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;

  const late = rows.filter((r) => waitInfo(r).tone === "red").length;
  const unverified = rows.filter((r) => !r.order_verified).length;

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>خطط تنتظرك</h1>
      {error ? <p className="alert err">{error}</p> : null}

      <div className="grid3">
        <div className="stat">
          <b>{rows.length.toString()}</b>
          <span>تنتظر خطة</span>
        </div>
        <div className="stat">
          <b style={{ color: late ? "var(--red)" : undefined }}>{late.toString()}</b>
          <span>وصلت ٣ أيام عمل</span>
        </div>
        <div className="stat">
          <b>{unverified.toString()}</b>
          <span>رقم الطلب ما تأكد</span>
        </div>
      </div>

      <div className="picks" role="group" aria-label="تصفية">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className="pick" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length ? (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 10 }}>
          {shown.map((r) => {
            const a = normalizeAnswers(r.answers);
            const w = waitInfo(r);
            return (
              <li key={r.id}>
                <Link className="list-row" href={`/coach/requests/${r.id}`}>
                  <span className="avatar">{(a.full_name || "؟").trim().slice(0, 1)}</span>
                  <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="row wrap" style={{ gap: 8 }}>
                      <b>{a.full_name || "بدون اسم"}</b>
                      <span className="chip clay">{planTypeLabel(r)}</span>
                      {r.status === "in_progress" ? <span className="chip blue">شغالة عليها</span> : null}
                      {!r.order_verified ? <span className="chip">الطلب ما تأكد</span> : null}
                    </span>
                    <span className="small muted">
                      {[a.age ? `${a.age} سنة` : null, a.weight_kg ? `${a.weight_kg} كجم` : null, a.workout.days ? `${a.workout.days} أيام تمرين` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`chip ${w.tone}`} style={{ marginInlineStart: "auto" }}>{w.label}</span>
                  <ChevronLeft size={18} color="var(--ink-3)" style={{ flexShrink: 0 }} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={<Inbox />} title="ما فيه خطط تنتظرك">
          أول ما تعبي مشتركة معلوماتها بتطلع هنا، مرتبة من الأقدم.
        </Empty>
      )}
    </CoachShell>
  );
}
