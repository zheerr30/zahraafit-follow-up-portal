"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Bug, FileText, ShieldCheck, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { shrinkPhoto } from "@/lib/followup";
import { ACTIVITY, CALC_GOALS, calcMacros, type CalcGoal } from "@/lib/macros";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { setGender } from "@/lib/gender";
import { signOut } from "@/lib/use-auth";
import type { Profile } from "@/lib/types";

const toNum = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, ".").replace(/[^\d.]/g, ""));

/** «بياناتي»: name, phone, gender, age, height, weight, activity, goal. Free accounts get a new daily target. */
export function MyDetails({ profile, sub, fallback }: { profile: Profile; sub: boolean; fallback: { age?: number | null; height?: number | null; weight?: number | null; goal?: string | null } }) {
  const toast = useToast();
  const [f, setF] = useState({ name: profile.full_name || "", phone: profile.phone || "", gender: (profile.gender || "female") as "female" | "male", age: "", height: "", weight: "", act: 1.375, goal: "تخسيس" as CalcGoal });
  const [orig, setOrig] = useState<typeof f | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("clients").select("id, age, height_cm, activity, goal").eq("profile_id", profile.id).maybeSingle();
      let w: number | null = null;
      if (c) {
        const { data: b } = await supabase.from("body_logs").select("weight_kg").eq("client_id", c.id).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle();
        w = b?.weight_kg ? Number(b.weight_kg) : null;
      }
      const goal = (c?.goal || fallback.goal || "تخسيس") as CalcGoal;
      const next = {
        name: profile.full_name || "", phone: profile.phone || "", gender: (profile.gender || "female") as "female" | "male",
        age: String(c?.age || fallback.age || ""), height: String(c?.height_cm || fallback.height || ""), weight: String(w ?? fallback.weight ?? ""),
        act: Number(c?.activity) || 1.375, goal: CALC_GOALS.some(([g]) => g === goal) ? goal : "تخسيس"
      };
      setClientId(c?.id || null);
      setF(next);
      setOrig(next);
    })();
  }, [profile.id, profile.full_name, profile.phone, profile.gender, fallback.age, fallback.height, fallback.weight, fallback.goal]);

  const changed = orig && JSON.stringify(f) !== JSON.stringify(orig);

  async function save(e: FormEvent) {
    e.preventDefault();
    const age = toNum(f.age), height = toNum(f.height), weight = toNum(f.weight);
    if (f.name.trim().length < 2) return setErr("اكتبي اسمك.");
    if (!(age >= 12 && age <= 90)) return setErr("اكتبي عمرك.");
    if (!(height >= 120 && height <= 230)) return setErr("اكتبي طولك بالسنتيمتر.");
    if (!(weight >= 30 && weight <= 300)) return setErr("اكتبي وزنك بالكيلو.");
    setBusy(true);
    setErr(null);
    const r1 = await supabase.rpc("update_my_profile", { p_full_name: f.name.trim(), p_phone: f.phone.trim() });
    const r2 = await supabase.rpc("save_my_details", { p_gender: f.gender, p_age: age, p_height: height, p_activity: f.act, p_goal: f.goal });
    if (r1.error || r2.error) {
      setBusy(false);
      return setErr(r2.error?.code === "PGRST202" ? "التعديل بيشتغل قريب." : "ما انحفظ. تأكدي من الاتصال وجربي مرة ثانية.");
    }
    const cid = (r2.data as string | null) || clientId;
    if (cid && orig && toNum(orig.weight) !== weight) {
      await supabase.from("body_logs").upsert({ client_id: cid, log_date: todayKey(), weight_kg: weight }, { onConflict: "client_id,log_date" });
    }
    let msg = "انحفظت بياناتك ✅";
    if (!sub && cid) {
      const t = calcMacros({ gender: f.gender, age, weight, height, act: f.act, goal: f.goal });
      if (t) {
        await supabase.from("food_targets").upsert({ client_id: cid, cal: t.cal, p: t.p, c: t.c, f: t.f }, { onConflict: "client_id" });
        msg = `انحفظت ✅ هدفك اليومي صار ${t.cal} سعرة`;
      }
    }
    setBusy(false);
    toast.show(msg);
    if (orig && orig.gender !== f.gender) {
      setGender(f.gender);
      setTimeout(() => window.location.reload(), 900);
    }
    setOrig(f);
  }

  return (
    <form className="card stack" onSubmit={save}>
      <div className="field">
        <label htmlFor="d-name">الاسم</label>
        <input id="d-name" className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="d-phone">رقم الجوال</label>
        <input id="d-phone" className="inp num" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="05xxxxxxxx" autoComplete="tel" />
      </div>
      <div className="field">
        <span className="label">الجنس</span>
        <div className="seg-tabs" role="radiogroup" aria-label="الجنس">
          {([["female", "👩 أنثى"], ["male", "👨 ذكر"]] as const).map(([g, l]) => (
            <button key={g} type="button" role="radio" aria-checked={f.gender === g} aria-selected={f.gender === g} onClick={() => setF({ ...f, gender: g })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid3">
        <div className="field"><label htmlFor="d-age">العمر</label><input id="d-age" className="inp num" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /></div>
        <div className="field"><label htmlFor="d-h">الطول (سم)</label><input id="d-h" className="inp num" inputMode="decimal" value={f.height} onChange={(e) => setF({ ...f, height: e.target.value })} /></div>
        <div className="field"><label htmlFor="d-w">الوزن (كجم)</label><input id="d-w" className="inp num" inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></div>
      </div>
      <div className="field">
        <label htmlFor="d-act">النشاط</label>
        <select id="d-act" className="inp" value={f.act} onChange={(e) => setF({ ...f, act: Number(e.target.value) })}>
          {ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="d-goal">الهدف</label>
        <select id="d-goal" className="inp" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value as CalcGoal })}>
          {CALC_GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <p className="note">{sub ? "هدفك اليومي من المدربة زهراء، وتعديل بياناتك هنا ما يغيره. لو تغير شي كبير علميها في تسجيل السبت." : "لما تعدلين بياناتك نحسب هدفك اليومي من جديد."}</p>
      <span className="note">الإيميل: <span dir="ltr">{profile.email}</span></span>
      {err ? <p className="alert err">{err}</p> : null}
      <button className="btn btn-s" type="submit" disabled={!changed || busy}>{busy ? "لحظة..." : "احفظي التعديل"}</button>
      {toast.node}
    </form>
  );
}

function deviceInfo() {
  const n = navigator as Navigator & { standalone?: boolean };
  return {
    ua: n.userAgent.slice(0, 300),
    platform: (n as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || n.platform || "",
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    standalone: Boolean(n.standalone || window.matchMedia("(display-mode: standalone)").matches),
    lang: n.language,
    online: n.onLine
  };
}

/** «بلغي عن مشكلة»: text + optional screenshot, with the device and app version. */
export function ReportProblem({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (body.trim().length < 3) return setMsg({ ok: false, t: "اكتبي وش صار معك." });
    setBusy(true);
    setMsg(null);
    let photo_path: string | null = null;
    if (file) {
      try {
        const blob = await shrinkPhoto(file);
        const path = `${profileId}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("reports").upload(path, blob, { contentType: "image/jpeg" });
        if (!up.error) photo_path = path;
      } catch {}
    }
    const { error } = await supabase.from("reports").insert({ body: body.trim().slice(0, 3000), photo_path, device: deviceInfo(), page: document.referrer ? new URL(document.referrer).pathname.slice(0, 190) : null, app_version: process.env.NEXT_PUBLIC_APP_VERSION || null });
    setBusy(false);
    if (error) return setMsg({ ok: false, t: error.code === "42P01" ? "البلاغات تشتغل قريب." : "ما انرسل. تأكدي من الاتصال وجربي مرة ثانية." });
    setBody("");
    setFile(null);
    setMsg({ ok: true, t: "وصلنا بلاغك ✅ شكرا لك، بنشوفه ونصلحه." });
  }

  if (!open) {
    return (
      <button type="button" className="list-row" onClick={() => setOpen(true)} style={{ width: "100%", textAlign: "start" }}>
        <span className="avatar" aria-hidden="true" style={{ background: "var(--sunken)", color: "var(--ink-2)" }}><Bug size={18} /></span>
        <span><b>بلغي عن مشكلة</b><span className="small muted" style={{ display: "block" }}>شي ما يشتغل أو شكله غلط؟ علمينا.</span></span>
      </button>
    );
  }
  return (
    <form className="card stack" onSubmit={send}>
      <b>🐞 بلغي عن مشكلة</b>
      <textarea className="inp" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="وش صار؟ وفي أي صفحة؟" aria-label="وصف المشكلة" />
      <label className="btn btn-g" style={{ cursor: "pointer" }}>
        📷 {file ? "تغيير الصورة" : "أضيفي صورة للشاشة (اختياري)"}
        <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      {file ? <span className="note">الصورة: {file.name}</span> : null}
      <p className="note">ينرسل مع البلاغ نوع جوالك والمتصفح ونسخة التطبيق، عشان نعرف نصلحها.</p>
      {msg ? <p className={`alert ${msg.ok ? "info" : "err"}`} role="status">{msg.t}</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-p" style={{ flex: 1 }} disabled={busy}>{busy ? "لحظة..." : "أرسلي البلاغ"}</button>
        <button type="button" className="btn btn-g" onClick={() => setOpen(false)}>إغلاق</button>
      </div>
    </form>
  );
}

export function LegalLinks() {
  return (
    <section className="card" style={{ padding: "2px 14px" }}>
      <Link href="/privacy" className="d-row"><span className="d-ic" style={{ background: "var(--sunken)", color: "var(--ink-2)" }}><ShieldCheck size={18} /></span><span className="d-mid"><b style={{ fontSize: 15 }}>سياسة الخصوصية</b></span></Link>
      <Link href="/terms" className="d-row"><span className="d-ic" style={{ background: "var(--sunken)", color: "var(--ink-2)" }}><FileText size={18} /></span><span className="d-mid"><b style={{ fontSize: 15 }}>الشروط والأحكام</b></span></Link>
    </section>
  );
}

/** Delete account: two confirmations, then her files and all her data are removed for real. */
export function DeleteAccount() {
  const [step, setStep] = useState(0);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    const { data: files, error: fe } = await supabase.rpc("my_files");
    if (fe) {
      setBusy(false);
      return setErr(fe.code === "PGRST202" ? "حذف الحساب يشتغل قريب." : "ما قدرنا نكمل. تأكدي من الاتصال وجربي مرة ثانية.");
    }
    const byBucket = new Map<string, string[]>();
    ((files as { bucket: string; path: string }[] | null) || []).forEach((x) => byBucket.set(x.bucket, [...(byBucket.get(x.bucket) || []), x.path]));
    for (const [b, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(b).remove(paths.slice(i, i + 100));
    }
    const { error } = await supabase.rpc("delete_my_account", { p_confirm: "حذف" });
    if (error) {
      setBusy(false);
      return setErr("ما انحذف كل شي. جربي مرة ثانية، ولو تكرر تواصلي مع المدربة.");
    }
    try { localStorage.clear(); } catch {}
    await signOut();
  }

  if (step === 0) {
    return (
      <button type="button" className="btn btn-g btn-block" style={{ color: "var(--danger, #C0392B)" }} onClick={() => setStep(1)}>
        <Trash2 /> حذف حسابي
      </button>
    );
  }
  return (
    <section className="card stack" style={{ borderInlineStart: "3px solid #C0392B" }}>
      <b>⚠️ حذف الحساب نهائي</b>
      <p className="small">بينحذف كل شي: معلوماتك، وخططك، وسجل أكلك وتمارينك، وأوزانك وقياساتك، وصور التقدم، والرسائل. وما نقدر نرجعها بعدين.</p>
      {step === 1 ? (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-p" style={{ flex: 1, background: "#C0392B" }} onClick={() => setStep(2)}>أبي أكمل الحذف</button>
          <button type="button" className="btn btn-g" onClick={() => setStep(0)}>تراجع</button>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="label">للتأكيد اكتبي كلمة: حذف</span>
            <input className="inp" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
          </label>
          {err ? <p className="alert err">{err}</p> : null}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-p" style={{ flex: 1, background: "#C0392B" }} disabled={word.trim() !== "حذف" || busy} onClick={run}>{busy ? "نحذف..." : "احذفي حسابي نهائيا"}</button>
            <button type="button" className="btn btn-g" onClick={() => { setStep(0); setWord(""); }}>تراجع</button>
          </div>
        </>
      )}
    </section>
  );
}
