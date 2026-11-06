"use client";

import { FormEvent, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { ClientShell, Loading, useToast } from "@/components/ui";
import { Reminders } from "@/components/Reminders";
import { RamadanToggle } from "@/components/RamadanToggle";
import { formatDate } from "@/lib/format";
import { GOALS, normalizeAnswers, planTypeLabel } from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import { signOut, useAuthGuard } from "@/lib/use-auth";
import { setGender } from "@/lib/gender";
import { accountOf } from "@/lib/account";
import { useClientPlans } from "@/lib/use-client";
import type { PlanRequest } from "@/lib/types";

const STATUS: Record<string, string> = {
  submitted: "⏳ تنتظر خطتك",
  in_progress: "👩‍🍳 المدربة تجهز خطتك",
  delivered: "✅ وصلتك خطتك",
  cancelled: "ملغي"
};

export default function AccountPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [pw, setPw] = useState({ a: "", b: "" });
  const [req, setReq] = useState<PlanRequest | null>(null);
  const [busy, setBusy] = useState<"info" | "pw" | null>(null);
  const [err, setErr] = useState<{ info?: string; pw?: string }>({});
  const [confirmOut, setConfirmOut] = useState(false);
  const [saved, setSaved] = useState({ full_name: "", phone: "" });

  useEffect(() => {
    if (!auth.profile) return;
    const start = { full_name: auth.profile.full_name || "", phone: auth.profile.phone || "" };
    setForm(start);
    setSaved(start);
    supabase.from("plan_requests").select("*").eq("profile_id", auth.profile.id).neq("status", "cancelled").order("submitted_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setReq((data as PlanRequest | null) || null));
  }, [auth.profile]);

  if (auth.loading || cp.loading) return <Loading />;
  if (!auth.profile) return null;
  const p = auth.profile;
  const a = req ? normalizeAnswers(req.answers) : null;

  async function saveInfo(e: FormEvent) {
    e.preventDefault();
    if (form.full_name.trim().length < 2) return setErr({ info: "اكتبي اسمك." });
    setBusy("info");
    const { error } = await supabase.rpc("update_my_profile", { p_full_name: form.full_name.trim(), p_phone: form.phone.trim() });
    setBusy(null);
    if (error) return setErr({ info: error.code === "PGRST202" ? "التعديل بيشتغل قريب." : "ما انحفظ. تأكدي من الاتصال وجربي مرة ثانية." });
    setErr({});
    setSaved({ full_name: form.full_name.trim(), phone: form.phone.trim() });
    toast.show("انحفظت معلوماتك ✅");
  }

  async function savePw(e: FormEvent) {
    e.preventDefault();
    if (pw.a.length < 8) return setErr({ pw: "كلمة المرور لازم تكون ٨ حروف أو أرقام على الأقل." });
    if (pw.a !== pw.b) return setErr({ pw: "الكلمتين مو متطابقة." });
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy(null);
    if (error) return setErr({ pw: /same|different/i.test(error.message) ? "هذي نفس كلمة المرور القديمة." : "ما تغيرت. جربي مرة ثانية." });
    setErr({});
    setPw({ a: "", b: "" });
    toast.show("تغيرت كلمة المرور ✅");
  }

  const changed = form.full_name.trim() !== saved.full_name || form.phone.trim() !== saved.phone;

  return (
    <ClientShell title="حسابي" sub="معلوماتك وإعداداتك">
      <section className="card row">
        <span className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{(p.full_name || "؟").slice(0, 1)}</span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 18 }}>{saved.full_name || p.full_name}</b>
          <div className="small muted" dir="ltr" style={{ textAlign: "right", overflowWrap: "anywhere" }}>{p.email}</div>
        </div>
      </section>

      <div className="sec-title">
        <span className="em" aria-hidden="true">👤</span>
        <h2>معلوماتي</h2>
      </div>
      <form className="card stack" onSubmit={saveInfo}>
        <div className="field">
          <label htmlFor="acc-name">الاسم</label>
          <input id="acc-name" className="inp" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="acc-phone">رقم الجوال</label>
          <input id="acc-phone" className="inp num" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" autoComplete="tel" />
        </div>
        <div className="field">
          <span className="label">الإيميل</span>
          <div className="inp" dir="ltr" style={{ background: "var(--sunken)", color: "var(--ink-2)", display: "flex", alignItems: "center", overflowWrap: "anywhere" }}>{p.email}</div>
          <span className="note">الإيميل هو اللي تدخلين فيه، ولو تبين تغيرينه تواصلي مع المدربة.</span>
        </div>
        <div className="field">
          <span className="label">الجنس</span>
          <div className="seg-tabs" role="radiogroup" aria-label="الجنس">
            {([["female", "👩 أنثى"], ["male", "👨 ذكر"]] as const).map(([g, l]) => (
              <button key={g} type="button" role="radio" aria-checked={(p.gender || "female") === g} aria-selected={(p.gender || "female") === g} onClick={async () => {
                if ((p.gender || "female") === g) return;
                const { error } = await supabase.rpc("set_my_gender", { p_gender: g });
                if (error) return setErr({ info: "ما انحفظ. جربي مرة ثانية." });
                setGender(g);
                window.location.reload();
              }}>{l}</button>
            ))}
          </div>
          <span className="note">عشان الكلام في التطبيق يطلع لك بالصيغة الصح.</span>
        </div>
        {err.info ? <p className="alert err">{err.info}</p> : null}
        <button className="btn btn-s" type="submit" disabled={!changed || busy === "info"}>{busy === "info" ? "لحظة..." : "احفظي التعديل"}</button>
      </form>

      {req ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">📋</span>
            <h2>اشتراكي</h2>
          </div>
          <section className="card">
            <dl className="kv">
              <div><dt>نوع الاشتراك</dt><dd>{planTypeLabel(req)}</dd></div>
              <div><dt>الحالة</dt><dd>{STATUS[req.status] || req.status}</dd></div>
              <div><dt>رقم الطلب</dt><dd className="num">{req.order_number}</dd></div>
              <div><dt>تاريخ الطلب</dt><dd>{formatDate(req.submitted_at)}</dd></div>
              {a?.goal ? <div><dt>هدفك</dt><dd>{GOALS[a.goal]}</dd></div> : null}
              {a?.age ? <div><dt>العمر</dt><dd className="num">{a.age}</dd></div> : null}
              {a?.height_cm ? <div><dt>الطول</dt><dd className="num">{a.height_cm} سم</dd></div> : null}
              {a?.weight_kg ? <div><dt>الوزن وقت الطلب</dt><dd className="num">{a.weight_kg} كجم</dd></div> : null}
            </dl>
          </section>
        </>
      ) : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">🔔</span>
        <h2>التذكيرات</h2>
      </div>
      <Reminders profileId={p.id} mealsPerDay={cp.meal?.days[0]?.meals.length || 3} subscriber={accountOf(p).sub} />

      <RamadanToggle profileId={p.id} />

      <div className="sec-title">
        <span className="em" aria-hidden="true">🔒</span>
        <h2>كلمة المرور</h2>
      </div>
      <form className="card stack" onSubmit={savePw}>
        <div className="field">
          <label htmlFor="pw-a">كلمة مرور جديدة</label>
          <input id="pw-a" className="inp" type="password" dir="ltr" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="pw-b">اكتبيها مرة ثانية</label>
          <input id="pw-b" className="inp" type="password" dir="ltr" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" />
        </div>
        {err.pw ? <p className="alert err">{err.pw}</p> : null}
        <button className="btn btn-s" type="submit" disabled={!pw.a || busy === "pw"}>{busy === "pw" ? "لحظة..." : "غيري كلمة المرور"}</button>
      </form>

      {confirmOut ? (
        <section className="card stack">
          <b>متأكدة تبين تسجلين خروج؟</b>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-p" style={{ flex: 1 }} onClick={signOut}>إيه، سجلي خروج</button>
            <button type="button" className="btn btn-g" onClick={() => setConfirmOut(false)}>لا</button>
          </div>
        </section>
      ) : (
        <button type="button" className="btn btn-g btn-block" style={{ color: "var(--clay-ink)" }} onClick={() => setConfirmOut(true)}>
          <LogOut />
          تسجيل الخروج
        </button>
      )}
      {toast.node}
    </ClientShell>
  );
}
