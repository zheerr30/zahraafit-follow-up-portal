"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList, UsersRound } from "lucide-react";
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

        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <section className="panel p-5">
            <h2 className="section-title">نظرة سريعة</h2>
            <div className="mt-5 grid gap-3">
              <StatCard label="عدد العميلات" value={formatNumber(clientsCount)} icon={<UsersRound size={20} />} />
              <StatCard label="آخر المتابعات" value={formatNumber(latestFollowups.length)} icon={<ClipboardList size={20} />} />
            </div>
            <Link className="primary-button mt-5 w-full" href="/admin/clients">
              <UsersRound size={18} />
              فتح قائمة العميلات
            </Link>
          </section>

          <section className="panel p-5">
            <h2 className="section-title">آخر المتابعات المرسلة</h2>
            {latestFollowups.length ? (
              <div className="mt-5 divide-y divide-slate-100">
                {latestFollowups.map((followup) => (
                  <div key={followup.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-lg bg-zahraa-mist p-4 text-sm text-slate-500">
                لا توجد متابعات مرسلة حتى الآن.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
