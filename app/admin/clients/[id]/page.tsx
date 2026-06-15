"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Pencil, Save, StickyNote, Upload, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { GoalProgressTracker } from "@/components/GoalProgressTracker";
import { ProgressLineChart } from "@/components/ProgressLineChart";
import {
  commitmentLabel,
  formatDate,
  formatNumber,
  photoTypeLabel,
  safeFileName
} from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type {
  Client,
  CoachNote,
  FollowupPhoto,
  FollowupWithPhotos,
  PhotoWithSignedUrl,
  Plan,
  Profile,
  WeeklyFollowup
} from "@/lib/types";

type PlanView = Plan & {
  signedUrl?: string;
};

type ClientEditForm = {
  full_name: string;
  phone: string;
  age: string;
  height_cm: string;
  start_weight: string;
  target_weight: string;
  goal: string;
  status: "active" | "paused";
  notes: string;
};

const emptyClientEditForm: ClientEditForm = {
  full_name: "",
  phone: "",
  age: "",
  height_cm: "",
  start_weight: "",
  target_weight: "",
  goal: "",
  status: "active",
  notes: ""
};

function toOptionalNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

async function signPhotos(photos: FollowupPhoto[]) {
  return Promise.all(
    photos.map(async (photo) => {
      const { data } = await supabase.storage
        .from("followup-photos")
        .createSignedUrl(photo.file_path, 60 * 60);

      return { ...photo, signedUrl: data?.signedUrl } satisfies PhotoWithSignedUrl;
    })
  );
}

async function signPlans(plans: Plan[]) {
  return Promise.all(
    plans.map(async (plan) => {
      if (!plan.file_path) return plan as PlanView;

      const { data } = await supabase.storage
        .from("client-plans")
        .createSignedUrl(plan.file_path, 60 * 60);

      return { ...plan, signedUrl: data?.signedUrl } satisfies PlanView;
    })
  );
}

export default function AdminClientDetailsPage() {
  const params = useParams();
  const clientId = useMemo(() => {
    const rawId = params?.id;
    return Array.isArray(rawId) ? rawId[0] : rawId || "";
  }, [params]);

  const auth = useAuthGuard("admin");
  const [client, setClient] = useState<Client | null>(null);
  const [clientProfile, setClientProfile] = useState<Profile | null>(null);
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [followups, setFollowups] = useState<FollowupWithPhotos[]>([]);
  const [coachNotes, setCoachNotes] = useState<CoachNote[]>([]);
  const [followupNotes, setFollowupNotes] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingFollowupId, setSavingFollowupId] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planContent, setPlanContent] = useState("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [clientEditForm, setClientEditForm] = useState<ClientEditForm>(emptyClientEditForm);
  const [savingClient, setSavingClient] = useState(false);
  const [clientEditSuccess, setClientEditSuccess] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function loadDetails() {
      if (!auth.profile || !clientId) return;

      setLoadingData(true);
      setError(null);

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();

      if (clientError || !clientData) {
        setError("لم يتم العثور على هذه العميلة.");
        setLoadingData(false);
        return;
      }

      const typedClient = clientData as Client;
      setClient(typedClient);

      const [profileResult, plansResult, followupsResult, notesResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", typedClient.profile_id).maybeSingle(),
        supabase
          .from("plans")
          .select("*")
          .eq("client_id", typedClient.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("weekly_followups")
          .select("*")
          .eq("client_id", typedClient.id)
          .order("week_date", { ascending: false }),
        supabase
          .from("coach_notes")
          .select("*")
          .eq("client_id", typedClient.id)
          .order("created_at", { ascending: false })
      ]);

      setClientProfile((profileResult.data as Profile | null) || null);
      setCoachNotes((notesResult.data as CoachNote[] | null) || []);

      const signedPlans = await signPlans((plansResult.data as Plan[] | null) || []);
      setPlans(signedPlans);

      const baseFollowups = (followupsResult.data as WeeklyFollowup[] | null) || [];
      const followupIds = baseFollowups.map((followup) => followup.id);
      let signedPhotos: PhotoWithSignedUrl[] = [];

      if (followupIds.length) {
        const { data: photosData } = await supabase
          .from("followup_photos")
          .select("*")
          .in("followup_id", followupIds);

        signedPhotos = await signPhotos((photosData as FollowupPhoto[] | null) || []);
      }

      const groupedPhotos = signedPhotos.reduce<Record<string, PhotoWithSignedUrl[]>>((acc, photo) => {
        acc[photo.followup_id] = [...(acc[photo.followup_id] || []), photo];
        return acc;
      }, {});

      const followupRows = baseFollowups.map((followup) => ({
        ...followup,
        photos: groupedPhotos[followup.id] || []
      }));

      setFollowups(followupRows);
      setFollowupNotes(
        followupRows.reduce<Record<string, string>>((acc, followup) => {
          acc[followup.id] = followup.coach_notes || "";
          return acc;
        }, {})
      );
      setLoadingData(false);
    }

    loadDetails();
  }, [auth.profile, clientId, refreshKey]);

  function openClientEditForm() {
    if (!client) return;

    setClientEditForm({
      full_name: clientProfile?.full_name || "",
      phone: clientProfile?.phone || "",
      age: client.age === null ? "" : String(client.age),
      height_cm: client.height_cm === null ? "" : String(client.height_cm),
      start_weight: client.start_weight === null ? "" : String(client.start_weight),
      target_weight: client.target_weight === null ? "" : String(client.target_weight),
      goal: client.goal || "",
      status: client.status,
      notes: client.notes || ""
    });
    setClientEditSuccess(null);
    setIsEditingClient(true);
  }

  function updateClientEditField(name: keyof ClientEditForm, value: string) {
    setClientEditForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleUpdateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !clientProfile || !clientEditForm.full_name.trim()) return;

    setSavingClient(true);
    setError(null);
    setClientEditSuccess(null);

    const profileUpdate = {
      full_name: clientEditForm.full_name.trim(),
      phone: clientEditForm.phone.trim() || null
    };

    const clientUpdate = {
      age: toOptionalNumber(clientEditForm.age),
      height_cm: toOptionalNumber(clientEditForm.height_cm),
      start_weight: toOptionalNumber(clientEditForm.start_weight),
      target_weight: toOptionalNumber(clientEditForm.target_weight),
      goal: clientEditForm.goal.trim() || null,
      status: clientEditForm.status,
      notes: clientEditForm.notes.trim() || null
    };

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", clientProfile.id);

    if (profileError) {
      setSavingClient(false);
      setError(profileError.message);
      return;
    }

    const { error: clientError } = await supabase
      .from("clients")
      .update(clientUpdate)
      .eq("id", client.id);

    setSavingClient(false);

    if (clientError) {
      setError(clientError.message);
      return;
    }

    setClientProfile((current) => (current ? { ...current, ...profileUpdate } : current));
    setClient((current) => (current ? { ...current, ...clientUpdate } : current));
    setClientEditSuccess("تم حفظ بيانات العميلة بنجاح.");
    setIsEditingClient(false);
  }

  async function handleAddCoachNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.profile || !client || !noteText.trim()) return;

    setSavingNote(true);
    setError(null);

    const { error: insertError } = await supabase.from("coach_notes").insert({
      client_id: client.id,
      coach_id: auth.profile.id,
      note: noteText.trim()
    });

    setSavingNote(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNoteText("");
    setRefreshKey((value) => value + 1);
  }

  async function handleSaveFollowupNote(followupId: string) {
    setSavingFollowupId(followupId);
    setError(null);

    const { error: updateError } = await supabase
      .from("weekly_followups")
      .update({ coach_notes: followupNotes[followupId] || null })
      .eq("id", followupId);

    setSavingFollowupId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setRefreshKey((value) => value + 1);
  }

  async function handleAddPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.profile || !client || !planTitle.trim()) return;

    setSavingPlan(true);
    setError(null);
    let filePath: string | null = null;

    if (planFile) {
      filePath = `${client.id}/${safeFileName(planFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("client-plans")
        .upload(filePath, planFile, { upsert: false });

      if (uploadError) {
        setSavingPlan(false);
        setError(uploadError.message);
        return;
      }
    }

    const { error: deactivateError } = await supabase
      .from("plans")
      .update({ is_current: false })
      .eq("client_id", client.id)
      .eq("is_current", true);

    if (deactivateError) {
      setSavingPlan(false);
      setError(deactivateError.message);
      return;
    }

    const { error: insertError } = await supabase.from("plans").insert({
      client_id: client.id,
      title: planTitle.trim(),
      content: planContent.trim() || null,
      file_path: filePath,
      file_url: null,
      is_current: true,
      created_by: auth.profile.id
    });

    setSavingPlan(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setPlanTitle("");
    setPlanContent("");
    setPlanFile(null);
    setRefreshKey((value) => value + 1);
  }

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
        <AppHeader profile={auth.profile} title="تفاصيل العميلة" />

        {error ? <div className="mb-5"><ErrorState message={error} /></div> : null}

        {!client ? (
          <ErrorState message="تعذر تحميل بيانات العميلة." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
            <aside className="space-y-6">
              <section className="panel p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-zahraa-coral">ملف العميلة</p>
                    <h2 className="mt-1 text-2xl font-black text-zahraa-navy">
                      {clientProfile?.full_name || "عميلة بدون اسم"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">{clientProfile?.email || "-"}</p>
                    <p className="mt-1 text-sm text-slate-500">{clientProfile?.phone || "لا يوجد رقم جوال"}</p>
                  </div>

                  <button className="secondary-button py-2" type="button" onClick={openClientEditForm}>
                    <Pencil size={18} />
                    تعديل بيانات العميلة
                  </button>
                </div>

                {clientEditSuccess ? (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                    {clientEditSuccess}
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Info label="العمر" value={formatNumber(client.age, " سنة")} />
                  <Info label="الطول" value={formatNumber(client.height_cm, " سم")} />
                  <Info label="وزن البداية" value={formatNumber(client.start_weight, " كجم")} />
                  <Info label="الوزن المستهدف" value={formatNumber(client.target_weight, " كجم")} />
                  <Info label="الحالة" value={client.status === "active" ? "نشطة" : "متوقفة"} />
                </div>

                <div className="mt-4 rounded-lg bg-zahraa-mist p-4">
                  <p className="text-sm font-bold text-zahraa-navy">الهدف</p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{client.goal || "-"}</p>
                </div>

                <div className="mt-4 rounded-lg bg-zahraa-mist p-4">
                  <p className="text-sm font-bold text-zahraa-navy">ملاحظات عامة</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                    {client.notes || "-"}
                  </p>
                </div>

                {isEditingClient ? (
                  <form className="mt-5 rounded-lg border border-zahraa-coral/25 bg-zahraa-coral/5 p-4" onSubmit={handleUpdateClient}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-black text-zahraa-navy">تعديل بيانات العميلة</h3>
                      <button
                        className="secondary-button px-3 py-2"
                        type="button"
                        onClick={() => setIsEditingClient(false)}
                        disabled={savingClient}
                      >
                        <X size={18} />
                        إغلاق
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="field-label">الاسم الكامل</span>
                        <input
                          className="field-input"
                          value={clientEditForm.full_name}
                          onChange={(event) => updateClientEditField("full_name", event.target.value)}
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="field-label">رقم الجوال</span>
                        <input
                          className="field-input"
                          dir="ltr"
                          type="tel"
                          value={clientEditForm.phone}
                          onChange={(event) => updateClientEditField("phone", event.target.value)}
                          placeholder="+9665XXXXXXXX"
                        />
                      </label>

                      <label className="block">
                        <span className="field-label">العمر</span>
                        <input
                          className="field-input"
                          type="number"
                          min="10"
                          max="100"
                          value={clientEditForm.age}
                          onChange={(event) => updateClientEditField("age", event.target.value)}
                        />
                      </label>

                      <label className="block">
                        <span className="field-label">الطول</span>
                        <input
                          className="field-input"
                          type="number"
                          min="100"
                          max="250"
                          step="0.1"
                          value={clientEditForm.height_cm}
                          onChange={(event) => updateClientEditField("height_cm", event.target.value)}
                        />
                      </label>

                      <label className="block">
                        <span className="field-label">وزن البداية</span>
                        <input
                          className="field-input"
                          type="number"
                          min="20"
                          max="300"
                          step="0.1"
                          value={clientEditForm.start_weight}
                          onChange={(event) => updateClientEditField("start_weight", event.target.value)}
                        />
                      </label>

                      <label className="block">
                        <span className="field-label">الوزن المستهدف</span>
                        <input
                          className="field-input"
                          type="number"
                          min="20"
                          max="300"
                          step="0.1"
                          value={clientEditForm.target_weight}
                          onChange={(event) => updateClientEditField("target_weight", event.target.value)}
                        />
                      </label>

                      <label className="block">
                        <span className="field-label">الحالة</span>
                        <select
                          className="field-input"
                          value={clientEditForm.status}
                          onChange={(event) => updateClientEditField("status", event.target.value)}
                        >
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block">
                      <span className="field-label">الهدف</span>
                      <textarea
                        className="field-input min-h-24 resize-y"
                        value={clientEditForm.goal}
                        onChange={(event) => updateClientEditField("goal", event.target.value)}
                      />
                    </label>

                    <label className="mt-4 block">
                      <span className="field-label">ملاحظات عامة</span>
                      <textarea
                        className="field-input min-h-24 resize-y"
                        value={clientEditForm.notes}
                        onChange={(event) => updateClientEditField("notes", event.target.value)}
                      />
                    </label>

                    <button className="primary-button mt-4 w-full" type="submit" disabled={savingClient}>
                      <Save size={18} />
                      {savingClient ? "جاري الحفظ..." : "حفظ"}
                    </button>
                  </form>
                ) : null}
              </section>

              <section className="panel p-5">
                <div className="mb-4 flex items-center gap-2">
                  <StickyNote className="text-zahraa-coral" size={20} />
                  <h2 className="section-title">ملاحظات المدربة</h2>
                </div>

                <form className="space-y-3" onSubmit={handleAddCoachNote}>
                  <textarea
                    className="field-input min-h-28 resize-y"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="اكتبي ملاحظة عامة تظهر للعميلة في لوحتها."
                  />
                  <button className="primary-button w-full" type="submit" disabled={savingNote || !noteText.trim()}>
                    <Save size={18} />
                    {savingNote ? "جاري الحفظ..." : "حفظ الملاحظة"}
                  </button>
                </form>

                <div className="mt-5 space-y-3">
                  {coachNotes.length ? (
                    coachNotes.map((note) => (
                      <article key={note.id} className="rounded-lg bg-zahraa-mist p-4">
                        <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{note.note}</p>
                        <p className="mt-3 text-xs font-bold text-slate-400">{formatDate(note.created_at)}</p>
                      </article>
                    ))
                  ) : (
                    <EmptyState title="لا توجد ملاحظات" description="أول ملاحظة محفوظة ستظهر هنا." />
                  )}
                </div>
              </section>

              <section className="panel p-5">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="text-zahraa-coral" size={20} />
                  <h2 className="section-title">إضافة خطة</h2>
                </div>

                <form className="space-y-4" onSubmit={handleAddPlan}>
                  <label className="block">
                    <span className="field-label">عنوان الخطة</span>
                    <input
                      className="field-input"
                      value={planTitle}
                      onChange={(event) => setPlanTitle(event.target.value)}
                      placeholder="مثال: خطة الأسبوع الأول"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="field-label">تفاصيل الخطة</span>
                    <textarea
                      className="field-input min-h-28 resize-y"
                      value={planContent}
                      onChange={(event) => setPlanContent(event.target.value)}
                      placeholder="يمكن إضافة الخطة كنص هنا."
                    />
                  </label>

                  <label className="block">
                    <span className="field-label">ملف الخطة</span>
                    <input
                      className="field-input"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      onChange={(event) => setPlanFile(event.target.files?.[0] || null)}
                    />
                  </label>

                  <button className="primary-button w-full" type="submit" disabled={savingPlan || !planTitle.trim()}>
                    <Upload size={18} />
                    {savingPlan ? "جاري الإضافة..." : "إضافة كخطة حالية"}
                  </button>
                </form>
              </section>
            </aside>

            <section className="space-y-6">
              <GoalProgressTracker client={client} followups={followups} />

              <ProgressLineChart followups={followups} />

              <div className="panel p-5">
                <h2 className="section-title">خطط العميلة</h2>
                <div className="mt-4 space-y-3">
                  {plans.length ? (
                    plans.map((plan) => (
                      <article key={plan.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-black text-zahraa-navy">{plan.title}</h3>
                            <p className="mt-1 text-xs font-bold text-slate-400">{formatDate(plan.created_at)}</p>
                          </div>
                          {plan.is_current ? (
                            <span className="rounded-md bg-zahraa-coral px-3 py-1 text-xs font-black text-white">
                              الخطة الحالية
                            </span>
                          ) : null}
                        </div>

                        {plan.content ? (
                          <p className="mt-3 whitespace-pre-line rounded-lg bg-zahraa-mist p-3 text-sm leading-7 text-slate-700">
                            {plan.content}
                          </p>
                        ) : null}

                        {plan.signedUrl ? (
                          <a className="secondary-button mt-3" href={plan.signedUrl} target="_blank" rel="noreferrer">
                            <FileText size={18} />
                            فتح ملف الخطة
                          </a>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <EmptyState title="لا توجد خطط" description="أضيفي أول خطة من النموذج الجانبي." />
                  )}
                </div>
              </div>

              <div className="panel p-5">
                <h2 className="section-title">المتابعات والصور</h2>

                <div className="mt-4 space-y-4">
                  {followups.length ? (
                    followups.map((followup) => (
                      <article key={followup.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-zahraa-coral">{formatDate(followup.week_date)}</p>
                            <h3 className="mt-1 text-lg font-black text-zahraa-navy">متابعة أسبوعية</h3>
                          </div>
                          <p className="text-xs font-bold text-slate-400">أرسلت في {formatDate(followup.created_at)}</p>
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
                            <p className="text-sm font-bold text-zahraa-navy">ملاحظات العميلة</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                              {followup.client_notes}
                            </p>
                          </div>
                        ) : null}

                        {followup.photos.length ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

                        <div className="mt-4 rounded-lg border border-zahraa-coral/25 bg-zahraa-coral/5 p-4">
                          <label className="block">
                            <span className="field-label">ملاحظة المدربة على هذه المتابعة</span>
                            <textarea
                              className="field-input min-h-24 resize-y"
                              value={followupNotes[followup.id] || ""}
                              onChange={(event) =>
                                setFollowupNotes((current) => ({
                                  ...current,
                                  [followup.id]: event.target.value
                                }))
                              }
                              placeholder="اكتبي ملاحظة مرتبطة بهذه المتابعة."
                            />
                          </label>
                          <button
                            className="primary-button mt-3"
                            type="button"
                            disabled={savingFollowupId === followup.id}
                            onClick={() => handleSaveFollowupNote(followup.id)}
                          >
                            <Save size={18} />
                            {savingFollowupId === followup.id ? "جاري الحفظ..." : "حفظ ملاحظة المتابعة"}
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState title="لا توجد متابعات" description="ستظهر متابعات العميلة هنا بعد الإرسال." />
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zahraa-mist px-3 py-2">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-zahraa-navy">{value}</p>
    </div>
  );
}
