"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, Inbox, Sparkles, UsersRound } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/Feedback";
import { StatCard } from "@/components/StatCard";
import { formatDate, formatNumber } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { WeeklyFollowup } from "@/lib/types";

export default function AdminDashboardPage() {
  const auth = useAuthGuard("admin");
  const [clientsCount, setClientsCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [latestFollowups, setLatestFollowups] = useState<WeeklyFollowup[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function loadAdminDashboard() {
      if (!auth.profile) return;

      const [clientsResult, followupsResult, waitingResult] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase
          .from("weekly_followups")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("plan_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "in_progress"])
      ]);

      setClientsCount(clientsResult.count || 0);
      setWaitingCount(waitingResult.count || 0);
      setLatestFollowups((followupsResult.data as WeeklyFollowup[] | null) || []);
      setLoadingData(false);
    }

    loadAdminDashboard();
  }, [auth.profile]);

  if (auth.loading || loadingData) return <LoadingState />;

  if (auth.error) {
    return (
      <main className="page-shell">
        <div className="page-container">
          <ErrorState message={auth.error} />
        </div>
      </main>
    );
  }

  if (!auth.profile) return null;

  return (
    <main className="page-shell">
      <div className="page-container">
        <AppHeader profile={auth.profile} title="لوحة المدربة" />

        <section className="dashboard-hero mb-6 reveal-card">
          <div className="hero-orb -right-16 top-6 h-56 w-56 bg-zahraa-coral/35" />
          <div className="hero-orb left-10 -top-20 h-64 w-64 bg-white/12" />
          <div className="relative grid gap-6 p-6 text-white lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/85 backdrop-blur">
                <Sparkles size={15} className="text-zahraa-coral" />
                Coach Command Center
              </div>
              <h2 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">لوحة متابعة العميلات</h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/78">
                مكان واحد لمراجعة المتابعات، الصور، الخطط، وملاحظات كل عميلة بسرعة ووضوح.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="primary-button" href="/admin/requests">
                  <Inbox size={18} />
                  خطط تنتظرك ({formatNumber(waitingCount)})
                </Link>
                <Link className="secondary-button border-white/20 bg-white/10 text-white hover:bg-white/15" href="/admin/clients">
                  <UsersRound size={18} />
                  قائمة العميلات
                </Link>
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 text-white/75">
                <Sparkles size={18} />
                <span className="text-sm font-black">ملخص اليوم</span>
              </div>
              <p className="mt-5 text-6xl font-black tracking-tight">{formatNumber(clientsCount)}</p>
              <p className="mt-2 text-sm text-white/75">عميلة في النظام</p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <section className="panel p-5">
            <h2 className="section-title">نظرة سريعة</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatCard label="خطط تنتظرك" value={formatNumber(waitingCount)} icon={<Inbox size={20} />} />
              <StatCard label="عدد العميلات" value={formatNumber(clientsCount)} icon={<UsersRound size={20} />} />
              <StatCard label="آخر المتابعات" value={formatNumber(latestFollowups.length)} icon={<ClipboardList size={20} />} />
            </div>
            <Link className="secondary-button mt-5 w-full" href="/admin/clients">
              <UsersRound size={18} />
              إدارة العميلات
            </Link>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">آخر المتابعات المرسلة</h2>
              <Link className="nav-pill" href="/admin/clients">
                عرض الكل
                <ArrowLeft size={16} />
              </Link>
            </div>
            {latestFollowups.length ? (
              <div className="mt-5 grid gap-3">
                {latestFollowups.map((followup) => (
                  <div key={followup.id} className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-zahraa-navy">
                        متابعة بتاريخ {formatDate(followup.week_date)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        الوزن: {formatNumber(followup.weight_kg, " كجم")} · الخصر: {formatNumber(followup.waist_cm, " سم")}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-slate-400">{formatDate(followup.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-zahraa-mist p-6 text-center text-sm text-slate-500">
                لا توجد متابعات مرسلة حتى الآن.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
