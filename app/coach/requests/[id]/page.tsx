"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, ClipboardCopy, FileText, ShieldCheck, Undo2, Utensils } from "lucide-react";
import { GeneratorPanel } from "@/components/GeneratorPanel";
import type { ParsedPlan } from "@/lib/plan-data";
import { PlanDelivery } from "@/components/PlanDelivery";
import { CoachShell, Loading, useToast } from "@/components/ui";
import { businessDaysBetween, deliveryWindow, formatDay } from "@/lib/business-days";
import { formatDate } from "@/lib/format";
import { GENDERS, GOALS, LEVEL_SHORT, PLACES, answersToGeneratorText, normalizeAnswers, planTypeLabel } from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { PlanRequest } from "@/lib/types";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function CoachRequestPage() {
  const auth = useAuthGuard("admin");
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [req, setReq] = useState<PlanRequest | null>(null);
  const [history, setHistory] = useState<PlanRequest[]>([]);
  const [inbodyUrl, setInbodyUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [incoming, setIncoming] = useState<ParsedPlan | null>(null);

  useEffect(() => {
    async function load() {
      if (!auth.profile || !params?.id) return;
      const { data } = await supabase.from("plan_requests").select("*").eq("id", params.id).maybeSingle();
      if (!data) {
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

  async function update(patch: Partial<PlanRequest>, msg: string) {
    if (!req) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.from("plan_requests").update(patch).eq("id", req.id).select("*").single();
    setBusy(false);
    if (err || !data) return setError("ما قدرنا نحفظ التغيير. جربي مرة ثانية.");
    setReq(data as PlanRequest);
    toast.show(msg);
  }

  async function copy() {
    if (!req) return;
    try {
      await navigator.clipboard.writeText(answersToGeneratorText(normalizeAnswers(req.answers), req));
      toast.show("نسخت معلوماتها. الصقيها في المولّد");
    } catch {
      setError("المتصفح منع النسخ. افتحي «النص اللي ينسخ للمولّد» تحت وانسخيه.");
    }
  }

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;
  if (!req) {
    return (
      <CoachShell>
        <p className="alert err">ما لقينا هذا الطلب.</p>
        <Link className="btn btn-g" href="/coach">رجوع لخطط تنتظرك</Link>
      </CoachShell>
    );
  }

  const a = normalizeAnswers(req.answers);
  const win = deliveryWindow(req.submitted_at);
  const waited = businessDaysBetween(req.submitted_at);

  return (
    <CoachShell>
      <Link className="link" href="/coach">
        <ChevronRight />
        خطط تنتظرك
      </Link>

      <div className="row wrap" style={{ gap: 10 }}>
        <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>{(a.full_name || "؟").slice(0, 1)}</span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24 }}>{a.full_name || "بدون اسم"}</h1>
          <div className="row wrap small" style={{ gap: 8 }}>
            <span className="chip clay">{planTypeLabel(req)}</span>
            <span className="muted">
              وصل {formatDate(req.submitted_at)} · من {waited.toString()} يوم عمل
            </span>
          </div>
        </div>
      </div>

      {error ? <p className="alert err" role="alert">{error}</p> : null}

      {req.status !== "delivered" ? (
        <section className="card stack">
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">الخطوة ١</span>
            <h2 style={{ fontSize: 17 }}>ولّدي الجدول</h2>
            <p className="note">
              يفتح لك المولّد ومعلوماتها معبّاة فيه. المشتركة تنتظره بين <b>{formatDay(win.from)}</b> و<b>{formatDay(win.to)}</b>.
            </p>
          </div>
          {req.wants_nutrition ? (
            <button type="button" className="btn btn-p btn-block" onClick={() => { setGenOpen(true); if (req.status === "submitted") update({ status: "in_progress", started_at: new Date().toISOString() }, "صارت في «شغالة عليها»"); }}>
              <Utensils />
              ولّدي الجدول الغذائي
            </button>
          ) : null}
          <button type="button" className={`btn btn-block ${req.wants_nutrition ? "btn-g" : "btn-p"}`} onClick={() => { copy(); if (req.status === "submitted") update({ status: "in_progress", started_at: new Date().toISOString() }, "نسخت معلوماتها، وصارت في «شغالة عليها»"); }}>
            <ClipboardCopy />
            انسخي معلوماتها{req.wants_workout ? " (لمولّد التمارين)" : ""}
          </button>
          {req.status === "in_progress" ? (
            <div className="row between wrap small">
              <span className="chip blue">شغالة عليها</span>
              <button type="button" className="link" disabled={busy} onClick={() => update({ status: "submitted", started_at: null }, "رجعت لـ «ما بديت»")}>
                <Undo2 />
                رجعيها لـ «ما بديت»
              </button>
            </div>
          ) : (
            <p className="note">أول ما تبدئين، الطلب ينتقل لـ «شغالة عليها»، وما تقدر تعدل معلوماتها بعدها.</p>
          )}
        </section>
      ) : null}

      <PlanDelivery req={req} onDelivered={setReq} toast={toast.show} incoming={incoming} />
      {genOpen ? <GeneratorPanel answers={req.answers} name={a.full_name} onClose={() => setGenOpen(false)} onUse={(p) => { setIncoming(p); toast.show("الجدول صار في الخطوة ٢. راجعيه وأرسليه"); }} /> : null}

      <section className="card stack">
        <div className="row between wrap">
          <h2 style={{ fontSize: 17 }}>رقم الطلب</h2>
          <span className="num" dir="ltr" style={{ fontSize: 20 }}>{req.order_number}</span>
        </div>
        {req.order_verified ? (
          <p className="alert ok">
            <ShieldCheck size={16} style={{ verticalAlign: "-3px", marginInlineEnd: 6 }} />
            تأكدتي منه {req.verified_at ? formatDate(req.verified_at) : ""}
          </p>
        ) : (
          <>
            <p className="note">طابقي الرقم مع طلبات سلة. لما نربط سلة بيتأكد لحاله.</p>
            <button type="button" className="btn btn-g" disabled={busy} onClick={() => update({ order_verified: true, verified_at: new Date().toISOString() }, "تأكد الطلب")}>
              <ShieldCheck />
              الطلب صحيح
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>معلوماتها</h2>
        <dl className="kv">
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
      </section>

      {req.wants_nutrition ? (
        <section className="card">
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>الأكل</h2>
          <dl className="kv">
            <Row label="ما تاكله أبدًا" value={a.nutrition.excluded.length ? a.nutrition.excluded.join("، ") : "لا يوجد"} />
            <Row label="ما تحبه" value={a.nutrition.dislikes} />
            <Row label="عدد الوجبات" value={a.nutrition.meals_per_day} />
            <Row label="ملاحظات" value={a.nutrition.notes} />
          </dl>
        </section>
      ) : null}

      {req.wants_workout ? (
        <section className="card">
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>التمرين</h2>
          <dl className="kv">
            <Row label="أيام التمرين" value={a.workout.days} />
            <Row label="المكان" value={a.workout.place ? PLACES[a.workout.place] : null} />
            <Row label="المستوى" value={a.workout.level ? LEVEL_SHORT[a.workout.level] : null} />
            <Row label="إصابات أو آلام" value={a.workout.injuries.length ? a.workout.injuries.join("، ") : "لا يوجد"} />
            <Row label="ملاحظات" value={a.workout.notes} />
          </dl>
        </section>
      ) : null}

      <section className="card stack">
        <dl className="kv">
          <Row label="عرفتنا من" value={a.source} />
          <Row label="تعليقات" value={a.comments} />
        </dl>
        {inbodyUrl ? (
          <a className="btn btn-g" href={inbodyUrl} target="_blank" rel="noreferrer">
            <FileText />
            افتحي تحليل InBody
          </a>
        ) : (
          <p className="note">ما رفعت تحليل InBody.</p>
        )}
      </section>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>النص اللي ينسخ للمولّد</summary>
        <pre className="copy-box" style={{ marginTop: 12 }}>{answersToGeneratorText(a, req)}</pre>
      </details>

      <section className="card stack">
        <label htmlFor="coach-note" style={{ fontWeight: 700 }}>ملاحظة لك</label>
        <textarea id="coach-note" className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ما تشوفها المشتركة" />
        <button type="button" className="btn btn-g" disabled={busy || note === (req.coach_note || "")} onClick={() => update({ coach_note: note }, "حفظت الملاحظة")}>
          حفظ الملاحظة
        </button>
      </section>

      {history.length ? (
        <section className="card stack">
          <h2 style={{ fontSize: 17 }}>طلباتها السابقة</h2>
          {history.map((h) => (
            <Link key={h.id} className="row between small" href={`/coach/requests/${h.id}`} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <b>{planTypeLabel(h)}</b>
              <span className="muted">{formatDate(h.submitted_at)}</span>
            </Link>
          ))}
        </section>
      ) : null}

      {toast.node}
    </CoachShell>
  );
}
