"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, Sparkles, UsersRound } from "lucide-react";
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
  const [latestFollowups, setLatestFollowups] = useState<WeeklyFollowup[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function loadAdminDashboard() {
      if (!auth.profile) return;

      const [clientsResult, followupsResult] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase
          .from("weekly_followups")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5)
      ]);

      setClientsCount(clientsResult.count || 0);
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

        <section className="mb-6 overflow-hidden rounded-lg bg-zahraa-navy shadow-soft">
          <div className="grid gap-5 p-5 text-white lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
            <div>
              <p className="text-sm font-black text-zahraa-coral">Coach Command Center</p>
              <h2 className="mt-2 text-3xl font-black leading-tight">لوحة متابعة العميلات</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
                مكان واحد لمراجعة المتابعات، الصور، الخطط، وملاحظات كل عميلة بسرعة ووضوح.
              </p>
              <Link className="primary-button mt-5" href="/admin/clients">
                <UsersRound size={18} />
                فتح قائمة العميلات
              </Link>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 p-5">
              <div className="flex items-center gap-2 text-white/75">
                <Sparkles size={18} />
                <span className="text-sm font-black">ملخص اليوم</span>
              </div>
              <p className="mt-4 text-4xl font-black">{formatNumber(clientsCount)}</p>
              <p className="mt-2 text-sm text-white/75">عميلة في النظام</p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <section className="panel p-5">
            <h2 className="section-title">نظرة سريعة</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
                  <div key={followup.id} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
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
