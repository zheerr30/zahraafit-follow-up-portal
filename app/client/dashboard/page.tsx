"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, FileText, Footprints, Plus, Ruler, Scale, StickyNote } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
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
          .limit(4),
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
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <section className="space-y-6">
              <div className="panel p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-zahraa-coral">مرحبًا</p>
                    <h2 className="mt-1 text-2xl font-black text-zahraa-navy">
                      {auth.profile.full_name}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {client.goal || "لم يتم تحديد هدف بعد."}
                    </p>
                  </div>

                  <Link className="primary-button" href="/client/follow-up/new">
                    <Plus size={18} />
                    تعبئة المتابعة الأسبوعية
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="وزن البداية" value={formatNumber(client.start_weight, " كجم")} icon={<Scale size={20} />} />
                  <StatCard label="الطول" value={formatNumber(client.height_cm, " سم")} icon={<Ruler size={20} />} />
                  <StatCard label="العمر" value={formatNumber(client.age, " سنة")} icon={<CalendarDays size={20} />} />
                  <StatCard label="الحالة" value={client.status === "active" ? "نشطة" : "متوقفة"} icon={<Footprints size={20} />} />
                </div>
              </div>

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
                  <h2 className="section-title">آخر المتابعات</h2>
                  <Link className="secondary-button py-2" href="/client/follow-ups">
                    عرض السجل
                  </Link>
                </div>

                {followups.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {followups.map((followup) => (
                      <article key={followup.id} className="rounded-lg border border-slate-200 p-4">
                        <p className="text-sm font-bold text-zahraa-coral">
                          {formatDate(followup.week_date)}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
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
                    description="ابدئي بأول متابعة أسبوعية من الزر أعلى الصفحة."
                  />
                )}
              </div>
            </section>

            <aside className="space-y-6">
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
        )}
      </div>
    </main>
  );
}
