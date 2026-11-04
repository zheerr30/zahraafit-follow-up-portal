"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ClipboardCopy, FileText, Loader2, PlayCircle, ShieldCheck, UndoDot, UserRound } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/Feedback";
import { businessDaysBetween, deliveryWindow, formatDay } from "@/lib/business-days";
import { formatDate } from "@/lib/format";
import {
  GENDERS,
  GOALS,
  LEVEL_SHORT,
  PLACES,
  answersToGeneratorText,
  normalizeAnswers,
  planTypeLabel
} from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { PlanRequest } from "@/lib/types";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid gap-1 border-t border-slate-100 py-3 first:border-t-0 sm:grid-cols-[160px_1fr]">
      <dt className="text-sm font-bold text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line text-sm leading-7 text-slate-800">{value}</dd>
    </div>
  );
}

export default function AdminRequestPage() {
  const auth = useAuthGuard("admin");
  const params = useParams<{ id: string }>();
  const [req, setReq] = useState<PlanRequest | null>(null);
  const [history, setHistory] = useState<PlanRequest[]>([]);
  const [inbodyUrl, setInbodyUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!auth.profile || !params?.id) return;
      const { data, error: err } = await supabase.from("plan_requests").select("*").eq("id", params.id).maybeSingle();
      if (err || !data) {
        setError("ما لقينا هذا الطلب.");
        setLoading(false);
        return;
      }
      const r = data as PlanRequest;
      setReq(r);
      setNote(r.coach_note || "");
      const [{ data: prev }, signed] = await Promise.all([
        supabase.from("plan_requests").select("*").eq("client_id", r.client_id).neq("id", r.id).order("submitted_at", { ascending: false }),
        r.inbody_path ? supabase.storage.from("inbody").createSignedUrl(r.inbody_path, 60 * 60) : Promise.resolve({ data: null })
      ]);
      setHistory((prev as PlanRequest[] | null) || []);
      setInbodyUrl(signed.data?.signedUrl || null);
      setLoading(false);
    }
    load();
  }, [auth.profile, params?.id]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function update(patch: Partial<PlanRequest>, msg: string) {
    if (!req) return;
    setBusy(true);
    const { data, error: err } = await supabase.from("plan_requests").update(patch).eq("id", req.id).select("*").single();
    setBusy(false);
    if (err || !data) {
      setError("ما قدرنا نحفظ التغيير. جربي مرة ثانية.");
      return;
    }
    setReq(data as PlanRequest);
    flash(msg);
  }

  async function copyForGenerator() {
    if (!req) return;
    const text = answersToGeneratorText(normalizeAnswers(req.answers), req);
    try {
      await navigator.clipboard.writeText(text);
      flash("نسخت المعلومات. الصقيها في المولّد");
    } catch {
      setError("المتصفح منع النسخ. حددي النص من القسم تحت وانسخيه.");
    }
  }

  if (auth.loading || loading) return <LoadingState />;
  if (!auth.profile) return null;

  if (!req) {
    return (
      <main className="page-shell">
        <div className="page-container">
          <AppHeader profile={auth.profile} title="طلب خطة" />
          <ErrorState message={error || "ما لقينا هذا الطلب."} />
        </div>
      </main>
    );
  }

  const a = normalizeAnswers(req.answers);
  const win = deliveryWindow(req.submitted_at);
  const waited = businessDaysBetween(req.submitted_at);

  return (
    <main className="page-shell">
      <div className="page-container">
        <AppHeader profile={auth.profile} title={a.full_name || "طلب خطة"} />

        <Link className="nav-pill mb-4" href="/admin/requests">
          <ArrowRight size={16} />
          خطط تنتظرك
        </Link>

        {error ? <div className="mb-4"><ErrorState message={error} /></div> : null}

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="space-y-6">
            <div className="panel p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zahraa-coral/10 px-3 py-1 text-sm font-black text-zahraa-coral">{planTypeLabel(req)}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
                  وصل {formatDate(req.submitted_at)} · من {waited.toLocaleString("ar-SA")} يوم عمل
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                المشتركة تنتظرها بين <b>{formatDay(win.from)}</b> و<b>{formatDay(win.to)}</b>.
              </p>
            </div>

            <div className="panel p-5">
              <h2 className="section-title mb-2">معلوماتها</h2>
              <dl>
                <Row label="الاسم" value={a.full_name} />
                <Row label="الجوال" value={a.phone} />
                <Row label="العمر" value={a.age ? `${a.age} سنة` : null} />
                <Row label="الجنس" value={a.gender ? GENDERS[a.gender] : null} />
                <Row label="الطول" value={a.height_cm ? `${a.height_cm} سم` : null} />
                <Row label="الوزن" value={a.weight_kg ? `${a.weight_kg} كجم` : null} />
                <Row label="الهدف" value={a.goal ? GOALS[a.goal] : null} />
                <Row label="تفاصيل الهدف" value={a.goal_details} />
                <Row label="الحالة الصحية" value={a.health.length ? a.health.join("، ") : "لا يوجد"} />
                <Row label="تفاصيل صحية" value={a.health_notes} />
              </dl>
            </div>

            {req.wants_nutrition ? (
              <div className="panel p-5">
                <h2 className="section-title mb-2">الأكل</h2>
                <dl>
                  <Row label="ما تاكله أبدًا" value={a.nutrition.excluded.length ? a.nutrition.excluded.join("، ") : "لا يوجد"} />
                  <Row label="ما تحبه" value={a.nutrition.dislikes} />
                  <Row label="عدد الوجبات" value={a.nutrition.meals_per_day} />
                  <Row label="ملاحظات" value={a.nutrition.notes} />
                </dl>
              </div>
            ) : null}

            {req.wants_workout ? (
              <div className="panel p-5">
                <h2 className="section-title mb-2">التمرين</h2>
                <dl>
                  <Row label="أيام التمرين" value={a.workout.days} />
                  <Row label="المكان" value={a.workout.place ? PLACES[a.workout.place] : null} />
                  <Row label="المستوى" value={a.workout.level ? LEVEL_SHORT[a.workout.level] : null} />
                  <Row label="إصابات أو آلام" value={a.workout.injuries.length ? a.workout.injuries.join("، ") : "لا يوجد"} />
                  <Row label="ملاحظات" value={a.workout.notes} />
                </dl>
              </div>
            ) : null}

            <div className="panel p-5">
              <h2 className="section-title mb-2">ثاني</h2>
              <dl>
                <Row label="عرفتنا من" value={a.source} />
                <Row label="تعليقات" value={a.comments} />
              </dl>
              {inbodyUrl ? (
                <a className="secondary-button mt-3" href={inbodyUrl} target="_blank" rel="noreferrer">
                  <FileText size={18} />
                  افتحي تحليل InBody
                </a>
              ) : null}
            </div>

            <details className="panel p-5">
              <summary className="cursor-pointer font-black text-zahraa-navy">النص اللي ينسخ للمولّد</summary>
              <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-zahraa-mist p-4 text-sm leading-7 text-slate-700" dir="rtl">
                {answersToGeneratorText(a, req)}
              </pre>
            </details>
          </section>

          <aside className="space-y-6">
            <div className="panel space-y-3 p-5">
              <h2 className="section-title">وش تسوين؟</h2>
              <button type="button" className="primary-button w-full" onClick={copyForGenerator}>
                <ClipboardCopy size={18} />
                انسخي معلوماتها للمولّد
              </button>

              {req.status === "submitted" ? (
                <button type="button" className="secondary-button w-full" disabled={busy} onClick={() => update({ status: "in_progress", started_at: new Date().toISOString() }, "تمام، صارت عندك في شغالة عليها")}>
                  {busy ? <Loader2 className="animate-spin" size={18} /> : <PlayCircle size={18} />}
                  بدأت عليها
                </button>
              ) : null}

              {req.status === "in_progress" ? (
                <>
                  <button type="button" className="secondary-button w-full" disabled={busy} onClick={() => update({ status: "delivered", delivered_at: new Date().toISOString() }, "خلصت. طلعت من القائمة")}>
                    <CheckCircle2 size={18} />
                    خلصت وأرسلت الخطة
                  </button>
                  <button type="button" className="secondary-button w-full" disabled={busy} onClick={() => update({ status: "submitted", started_at: null }, "رجعت لـ ما بديت")}>
                    <UndoDot size={18} />
                    رجعيها لـ ما بديت
                  </button>
                </>
              ) : null}

              {req.status === "delivered" ? (
                <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                  <Check className="-mt-0.5 me-1 inline" size={16} />
                  أرسلتيها {req.delivered_at ? formatDate(req.delivered_at) : ""}
                </p>
              ) : null}

              <Link className="nav-pill w-full justify-center" href={`/admin/clients/${req.client_id}`}>
                <UserRound size={16} />
                ملفها ورفع الخطة
              </Link>
            </div>

            <div className="panel space-y-3 p-5">
              <h2 className="section-title">رقم الطلب</h2>
              <p dir="ltr" className="text-left text-2xl font-black tracking-wide text-zahraa-navy">{req.order_number}</p>
              {req.order_verified ? (
                <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                  <ShieldCheck className="-mt-0.5 me-1 inline" size={16} />
                  تأكدتي منه {req.verified_at ? formatDate(req.verified_at) : ""}
                </p>
              ) : (
                <>
                  <p className="muted-text">طابقي الرقم مع طلبات سلة. لما نربط سلة بيتأكد لحاله.</p>
                  <button type="button" className="secondary-button w-full" disabled={busy} onClick={() => update({ order_verified: true, verified_at: new Date().toISOString() }, "تأكد الطلب")}>
                    <ShieldCheck size={18} />
                    الطلب صحيح
                  </button>
                </>
              )}
            </div>

            <div className="panel space-y-3 p-5">
              <label className="section-title block" htmlFor="coach-note">ملاحظة لك</label>
              <textarea id="coach-note" className="field-input min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ما تشوفها المشتركة" />
              <button type="button" className="secondary-button w-full" disabled={busy || note === (req.coach_note || "")} onClick={() => update({ coach_note: note }, "حفظت الملاحظة")}>
                حفظ الملاحظة
              </button>
            </div>

            {history.length ? (
              <div className="panel p-5">
                <h2 className="section-title mb-3">طلباتها السابقة</h2>
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <Link className="flex items-center justify-between gap-3 rounded-2xl bg-zahraa-mist p-3 text-sm hover:bg-slate-100" href={`/admin/requests/${h.id}`}>
                        <span className="font-bold text-zahraa-navy">{planTypeLabel(h)}</span>
                        <span className="text-slate-500">{formatDate(h.submitted_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        {toast ? (
          <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zahraa-navy px-5 py-3 text-sm font-bold text-white shadow-soft">
            {toast}
          </div>
        ) : null}
      </div>
    </main>
  );
}
