"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, Inbox, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { StatCard } from "@/components/StatCard";
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
  if (waited >= 3) return { waited, tone: "late" as const, label: waited === 3 ? "اليوم آخر يوم" : `متأخرة ${waited - 3} يوم` };
  if (waited === 2) return { waited, tone: "soon" as const, label: "باقي يوم" };
  return { waited, tone: "ok" as const, label: waited === 0 ? "وصلت اليوم" : "من يوم عمل" };
}

const TONE: Record<"late" | "soon" | "ok", string> = {
  late: "bg-red-50 text-red-700",
  soon: "bg-amber-50 text-amber-800",
  ok: "bg-slate-100 text-slate-600"
};

export default function AdminRequestsPage() {
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
      if (err) setError("تعذر تحميل الطلبات. تأكدي إنك شغلتي ملف phase1-plan-requests.sql في Supabase.");
      setRows((data as PlanRequest[] | null) || []);
      setLoading(false);
    }
    load();
  }, [auth.profile]);

  const shown = useMemo(
    () =>
      rows.filter((r) =>
        filter === "all" ? true : filter === "unverified" ? !r.order_verified : r.status === filter
      ),
    [rows, filter]
  );

  if (auth.loading || loading) return <LoadingState />;
  if (!auth.profile) return null;

  const late = rows.filter((r) => waitInfo(r).tone === "late").length;
  const unverified = rows.filter((r) => !r.order_verified).length;

  return (
    <main className="page-shell">
      <div className="page-container">
        <AppHeader profile={auth.profile} title="خطط تنتظرك" />
        {error ? <ErrorState message={error} /> : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="تنتظر خطة" value={rows.length.toLocaleString("ar-SA")} icon={<Inbox size={20} />} />
          <StatCard label="وصلت أو تعدت ٣ أيام عمل" value={late.toLocaleString("ar-SA")} icon={<AlertTriangle size={20} />} />
          <StatCard label="رقم الطلب ما تأكد" value={unverified.toLocaleString("ar-SA")} icon={<ShieldCheck size={20} />} />
        </div>

        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="تصفية">
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
                className={`min-h-[40px] rounded-full px-4 text-sm font-black transition ${
                  filter === k ? "bg-zahraa-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {shown.length ? (
            <ul className="grid gap-3">
              {shown.map((r) => {
                const a = normalizeAnswers(r.answers);
                const w = waitInfo(r);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/admin/requests/${r.id}`}
                      className="flex items-center gap-4 rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zahraa-navy/5 text-lg font-black text-zahraa-navy">
                        {(a.full_name || "؟").trim().slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <b className="text-zahraa-navy">{a.full_name || "بدون اسم"}</b>
                          <span className="rounded-full bg-zahraa-coral/10 px-2.5 py-0.5 text-xs font-black text-zahraa-coral">{planTypeLabel(r)}</span>
                          {r.status === "in_progress" ? (
                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-black text-blue-700">شغالة عليها</span>
                          ) : null}
                          {!r.order_verified ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-600">الطلب ما تأكد</span>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">
                          {[a.age ? `${a.age} سنة` : null, a.weight_kg ? `${a.weight_kg} كجم` : null, a.workout.days ? `${a.workout.days} أيام تمرين` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${TONE[w.tone]}`}>{w.label}</span>
                      <ChevronLeft className="shrink-0 text-slate-400" size={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="ما فيه خطط تنتظرك" description="أول ما تعبي مشتركة معلوماتها بتطلع هنا، مرتبة من الأقدم." />
          )}
        </section>
      </div>
    </main>
  );
}
