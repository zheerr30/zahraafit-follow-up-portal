"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { commitmentLabel, formatDate, formatNumber, photoTypeLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, FollowupPhoto, FollowupWithPhotos, PhotoWithSignedUrl, WeeklyFollowup } from "@/lib/types";

async function attachSignedUrls(photos: FollowupPhoto[]) {
  return Promise.all(
    photos.map(async (photo) => {
      const { data } = await supabase.storage
        .from("followup-photos")
        .createSignedUrl(photo.file_path, 60 * 60);

      return {
        ...photo,
        signedUrl: data?.signedUrl
      } satisfies PhotoWithSignedUrl;
    })
  );
}

export default function ClientFollowUpsPage() {
  const auth = useAuthGuard("client");
  const [items, setItems] = useState<FollowupWithPhotos[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFollowups() {
      if (!auth.profile) return;
      setLoadingData(true);

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("profile_id", auth.profile.id)
        .maybeSingle();

      if (clientError || !clientData) {
        setError("لم يتم العثور على ملف العميلة المرتبط بحسابك.");
        setLoadingData(false);
        return;
      }

      const client = clientData as Client;
      const { data: followupsData, error: followupsError } = await supabase
        .from("weekly_followups")
        .select("*")
        .eq("client_id", client.id)
        .order("week_date", { ascending: false });

      if (followupsError) {
        setError("تعذر تحميل سجل المتابعات.");
        setLoadingData(false);
        return;
      }

      const followups = (followupsData as WeeklyFollowup[] | null) || [];
      if (!followups.length) {
        setItems([]);
        setLoadingData(false);
        return;
      }

      const followupIds = followups.map((followup) => followup.id);
      const { data: photoData } = await supabase
        .from("followup_photos")
        .select("*")
        .in("followup_id", followupIds);

      const signedPhotos = await attachSignedUrls((photoData as FollowupPhoto[] | null) || []);
      const groupedPhotos = signedPhotos.reduce<Record<string, PhotoWithSignedUrl[]>>((acc, photo) => {
        acc[photo.followup_id] = [...(acc[photo.followup_id] || []), photo];
        return acc;
      }, {});

      setItems(
        followups.map((followup) => ({
          ...followup,
          photos: groupedPhotos[followup.id] || []
        }))
      );
      setLoadingData(false);
    }

    loadFollowups();
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
        <AppHeader profile={auth.profile} title="سجل المتابعات" />

        <section className="panel p-5">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">كل المتابعات السابقة</h2>
              <p className="muted-text mt-1">مرتبة من الأحدث إلى الأقدم.</p>
            </div>
            <Link className="primary-button" href="/client/follow-up/new">
              <Plus size={18} />
              متابعة جديدة
            </Link>
          </div>

          {error ? <ErrorState message={error} /> : null}

          {!error && !items.length ? (
            <EmptyState
              title="لا توجد متابعات بعد"
              description="عند تعبئة أول متابعة أسبوعية ستظهر هنا."
            />
          ) : null}

          <div className="space-y-4">
            {items.map((followup) => (
              <article key={followup.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-zahraa-coral">
                      {formatDate(followup.week_date)}
                    </p>
                    <h3 className="mt-1 text-lg font-black text-zahraa-navy">متابعة أسبوعية</h3>
                  </div>
                  <p className="text-xs font-bold text-slate-400">
                    أرسلت في {formatDate(followup.created_at)}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="الوزن" value={formatNumber(followup.weight_kg, " كجم")} />
                  <Info label="الخصر" value={formatNumber(followup.waist_cm, " سم")} />
                  <Info label="الأرداف" value={formatNumber(followup.hips_cm, " سم")} />
                  <Info label="الخطوات" value={formatNumber(followup.steps_count)} />
                  <Info label="الغذاء" value={commitmentLabel(followup.nutrition_commitment)} />
                  <Info label="التمارين" value={commitmentLabel(followup.workout_commitment)} />
                  <Info label="النوم" value={formatNumber(followup.sleep_hours, " ساعة")} />
                  <Info label="الدورة" value={followup.menstrual_cycle || "-"} />
                </div>

                {followup.client_notes ? (
                  <div className="mt-4 rounded-lg bg-zahraa-mist p-4">
                    <p className="text-sm font-bold text-zahraa-navy">ملاحظاتي</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                      {followup.client_notes}
                    </p>
                  </div>
                ) : null}

                {followup.coach_notes ? (
                  <div className="mt-4 rounded-lg border border-zahraa-coral/25 bg-zahraa-coral/5 p-4">
                    <p className="text-sm font-bold text-zahraa-navy">ملاحظة المدربة</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                      {followup.coach_notes}
                    </p>
                  </div>
                ) : null}

                {followup.photos.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {followup.photos.map((photo) => (
                      <figure key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {photo.signedUrl ? (
                          <img
                            className="aspect-[4/5] w-full object-cover"
                            src={photo.signedUrl}
                            alt={photoTypeLabel(photo.photo_type)}
                          />
                        ) : (
                          <div className="flex aspect-[4/5] items-center justify-center bg-zahraa-mist text-sm text-slate-400">
                            تعذر عرض الصورة
                          </div>
                        )}
                        <figcaption className="px-3 py-2 text-xs font-bold text-slate-500">
                          {photoTypeLabel(photo.photo_type)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zahraa-mist px-3 py-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-zahraa-navy">{value}</p>
    </div>
  );
}
