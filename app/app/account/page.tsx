"use client";

import { OffDays } from "@/components/OffDays";
import { FormEvent, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Brand, ClientShell, Loading, useToast } from "@/components/ui";
import { Reminders } from "@/components/Reminders";
import { RamadanToggle } from "@/components/RamadanToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HideNumbersToggle } from "@/components/HideNumbersToggle";
import { DeleteAccount, LegalLinks, MyDetails, ReportProblem } from "@/components/AccountExtras";
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
  const [pw, setPw] = useState({ a: "", b: "" });
  const [req, setReq] = useState<PlanRequest | null>(null);
  const [busy, setBusy] = useState<"pw" | null>(null);
  const [err, setErr] = useState<{ pw?: string }>({});
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    if (!auth.profile) return;
    supabase.from("plan_requests").select("*").eq("profile_id", auth.profile.id).neq("status", "cancelled").order("submitted_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setReq((data as PlanRequest | null) || null));
  }, [auth.profile]);

  if (auth.loading || cp.loading) return <Loading />;
  if (!auth.profile) return null;
  const p = auth.profile;
  const a = req ? normalizeAnswers(req.answers) : null;

  async function savePw(e: FormEvent) {
    e.preventDefault();
    if (pw.a.length < 8) return setErr({ pw: "كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل." });
    if (pw.a !== pw.b) return setErr({ pw: "الكلمتين مو متطابقة." });
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy(null);
    if (error) return setErr({ pw: /same|different/i.test(error.message) ? "هذي نفس كلمة المرور القديمة." : "ما تغيرت. جربي مرة ثانية." });
    setErr({});
    setPw({ a: "", b: "" });
    toast.show("تغيرت كلمة المرور ✅");
  }


  return (
    <ClientShell title="حسابي" sub="معلوماتك وإعداداتك">
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 2px" }}><Brand height={34} /></div>
      <section className="card row">
        <span className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{(p.full_name || "؟").slice(0, 1)}</span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 18 }}>{p.full_name}</b>
          <div className="small muted" dir="ltr" style={{ textAlign: "right", overflowWrap: "anywhere" }}>{p.email}</div>
        </div>
      </section>

      <div className="sec-title">
        <span className="em" aria-hidden="true">👤</span>
        <h2>بياناتي</h2>
      </div>
      <MyDetails profile={p} sub={accountOf(p).sub} fallback={{ age: a?.age, height: a?.height_cm, weight: a?.weight_kg, goal: null }} />

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
        <h2>الإشعارات</h2>
      </div>
      <Reminders profileId={p.id} mealsPerDay={cp.meal?.days[0]?.meals.length || 3} subscriber={accountOf(p).sub} />

      {cp.client ? <OffDays clientId={cp.client.id} /> : null}
      <ThemeToggle />
      <RamadanToggle profileId={p.id} />
      <HideNumbersToggle initial={Boolean(p.hide_numbers)} />

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

      <div className="sec-title">
        <span className="em" aria-hidden="true">💬</span>
        <h2>مساعدة</h2>
      </div>
      <ReportProblem profileId={p.id} />
      <LegalLinks />

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
      <DeleteAccount />
      <p className="slogan">قوة • توازن • بساطة</p>
      {toast.node}
    </ClientShell>
  );
}
