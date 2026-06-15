"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, FileText, Footprints, Plus, Ruler, Scale, StickyNote, Target } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { GoalProgressTracker } from "@/components/GoalProgressTracker";
import { ProgressLineChart } from "@/components/ProgressLineChart";
import { StatCard } from "@/components/StatCard";
import { formatDate, formatNumber } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, CoachNote, Plan, WeeklyFollowup } from "@/lib/types";

export default function ClientDashboardPage() {
  const auth = useAuthGuard("client");
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [followups, setFollowups] = useState<WeeklyFollowup[]>([]);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      if (!auth.profile) return;

      setLoadingData(true);
      setError(null);
      setPlanUrl(null);

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("profile_id", auth.profile.id)
        .maybeSingle();

      if (clientError || !clientData) {
        setClient(null);
        setLoadingData(false);
        setError("لم يتم ربط حسابك بملف عميلة بعد. تواصلي مع المدربة لإكمال الإعداد.");
        return;
      }

      const typedClient = clientData as Client;
      setClient(typedClient);

      const [planResult, followupsResult, notesResult] = await Promise.all([
        supabase
          .from("plans")
          .select("*")
          .eq("client_id", typedClient.id)
          .eq("is_current", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("weekly_followups")
          .select("*")
          .eq("client_id", typedClient.id)
          .order("week_date", { ascending: false })
          .limit(12),
        supabase
          .from("coach_notes")
          .select("*")
          .eq("client_id", typedClient.id)
          .order("created_at", { ascending: false })
          .limit(5)
      ]);

      const currentPlan = (planResult.data as Plan | null) || null;
      setPlan(currentPlan);
      setFollowups((followupsResult.data as WeeklyFollowup[] | null) || []);
      setNotes((notesResult.data as CoachNote[] | null) || []);

      if (currentPlan?.file_path) {
        const { data: signed } = await supabase.storage
          .from("client-plans")
          .createSignedUrl(currentPlan.file_path, 60 * 60);
        setPlanUrl(signed?.signedUrl || null);
      }

      setLoadingData(false);
    }

    loadDashboard();
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
        <AppHeader profile={auth.profile} title="لوحة العميلة" />

        {error || !client ? (
          <ErrorState message={error || "تعذر تحميل ملف العميلة."} />
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-lg bg-zahraa-navy shadow-soft">
              <div className="grid gap-5 p-5 text-white lg:grid-cols-[1.3fr_0.7fr] lg:p-7">
                <div>
                  <p className="text-sm font-black text-zahraa-coral">ZahraaFit Dashboard</p>
                  <h2 className="mt-2 text-3xl font-black leading-tight">
                    مرحبًا {auth.profile.full_name}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
                    {client.goal || "أضيفي هدفك مع المدربة ليظهر هنا بشكل أوضح."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link className="primary-button" href="/client/follow-up/new">
                      <Plus size={18} />
                      تعبئة المتابعة الأسبوعية
                    </Link>
                    <Link className="secondary-button border-white/20 bg-white/10 text-white hover:bg-white/15" href="/client/follow-ups">
                      عرض سجل المتابعات
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-white/70">
                      <Target size={18} />
                      <span className="text-xs font-black">الوزن المستهدف</span>
                    </div>
                    <p className="mt-2 text-3xl font-black">
                      {formatNumber(client.target_weight, " كجم")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-white/70">
                      <Footprints size={18} />
                      <span className="text-xs font-black">الحالة</span>
                    </div>
                    <p className="mt-2 text-3xl font-black">
                      {client.status === "active" ? "نشطة" : "متوقفة"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="وزن البداية" value={formatNumber(client.start_weight, " كجم")} icon={<Scale size={20} />} />
              <StatCard label="الوزن المستهدف" value={formatNumber(client.target_weight, " كجم")} icon={<Target size={20} />} />
              <StatCard label="الطول" value={formatNumber(client.height_cm, " سم")} icon={<Ruler size={20} />} />
              <StatCard label="العمر" value={formatNumber(client.age, " سنة")} icon={<CalendarDays size={20} />} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <section className="space-y-6">
                <GoalProgressTracker client={client} followups={followups} />

                <ProgressLineChart followups={followups} />

                <div className="panel p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="section-title">آخر المتابعات</h2>
                    <Link className="secondary-button py-2" href="/client/follow-ups">
                      عرض السجل
                    </Link>
                  </div>

                  {followups.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {followups.slice(0, 4).map((followup) => (
                        <article key={followup.id} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                          <p className="text-sm font-bold text-zahraa-coral">
                            {formatDate(followup.week_date)}
                          </p>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-slate-600">
                            <span>الوزن: {formatNumber(followup.weight_kg, " كجم")}</span>
                            <span>الخصر: {formatNumber(followup.waist_cm, " سم")}</span>
                            <span>الأرداف: {formatNumber(followup.hips_cm, " سم")}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="لم يتم إرسال متابعات بعد"
                      description="ابدئي بأول متابعة أسبوعية وسيظهر ملخص القياسات هنا."
                    />
                  )}
                </div>
              </section>

              <aside className="space-y-6">
                <div className="panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="section-title">الخطة الحالية</h2>
                  <FileText className="text-zahraa-coral" size={22} />
                </div>

                {plan ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{plan.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        أضيفت في {formatDate(plan.created_at)}
                      </p>
                    </div>
                    {plan.content ? (
                      <p className="whitespace-pre-line rounded-lg bg-zahraa-mist p-4 text-sm leading-7 text-slate-700">
                        {plan.content}
                      </p>
                    ) : null}
                    {planUrl ? (
                      <a className="secondary-button" href={planUrl} target="_blank" rel="noreferrer">
                        <FileText size={18} />
                        فتح ملف الخطة
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    title="لا توجد خطة حالية"
                    description="ستظهر الخطة هنا بعد إضافتها من حساب المدربة."
                  />
                )}
                </div>

                <div className="panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="section-title">ملاحظات المدربة</h2>
                  <StickyNote className="text-zahraa-coral" size={22} />
                </div>

                {notes.length ? (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <article key={note.id} className="rounded-lg bg-zahraa-mist p-4">
                        <p className="text-sm leading-7 text-slate-700">{note.note}</p>
                        <p className="mt-3 text-xs font-bold text-slate-400">
                          {formatDate(note.created_at)}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="لا توجد ملاحظات"
                    description="ستظهر ملاحظات المدربة هنا عند إضافتها."
                  />
                )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
