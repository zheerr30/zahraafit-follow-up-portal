"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { CoachShell, Loading, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { daysBetween } from "@/lib/followup";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Profile } from "@/lib/types";

type Row = Pick<Profile, "id" | "full_name" | "email" | "phone" | "account_type" | "subscription_end" | "photo_credits" | "created_at">;
type MapRow = { id: string; salla_product_id: string | null; product_name: string | null; option_value: string | null; days: number };
type Log = { id: number; order_id: string | null; status: string | null; result: string; created_at: string };
type Pending = { id: string; order_id: string; phone: string | null; email: string | null; days: number; product: string | null; created_at: string; applied_at: string | null };

const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");

/** Coach: who is a subscriber, activate by hand, and the Salla link. */
export default function AccountsPage() {
  const auth = useAuthGuard("admin");
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [map, setMap] = useState<MapRow[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [secretSet, setSecretSet] = useState(false);
  const [secret, setSecret] = useState("");
  const [newMap, setNewMap] = useState({ name: "", id: "", option: "", days: "30" });
  const [missing, setMissing] = useState(false);
  const today = todayKey();

  useEffect(() => {
    if (!auth.profile) return;
    (async () => {
      const [{ data: p, error }, { data: m }, { data: l }, { data: pe }, { data: c }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, account_type, subscription_end, photo_credits, created_at").eq("role", "client").order("created_at", { ascending: false }),
        supabase.from("products_map").select("*").order("created_at"),
        supabase.from("webhook_log").select("id, order_id, status, result, created_at").order("id", { ascending: false }).limit(30),
        supabase.from("pending_subscriptions").select("*").is("applied_at", null).order("created_at", { ascending: false }),
        supabase.from("salla_config").select("webhook_secret").eq("id", 1).maybeSingle()
      ]);
      if (error?.code === "42703") setMissing(true);
      setRows((p as Row[] | null) || []);
      setMap((m as MapRow[] | null) || []);
      setLogs((l as Log[] | null) || []);
      setPending((pe as Pending[] | null) || []);
      setSecretSet(Boolean((c as { webhook_secret: string | null } | null)?.webhook_secret));
    })();
  }, [auth.profile]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const d = digits(k);
    if (!k) return [];
    return (rows || []).filter((r) => (r.full_name || "").toLowerCase().includes(k) || (r.email || "").toLowerCase().includes(k) || (d.length >= 4 && digits(r.phone || "").includes(d.replace(/^966/, "").replace(/^0/, "")))).slice(0, 20);
  }, [rows, q]);

  const active = (r: Row) => r.account_type === "subscriber" && (!r.subscription_end || r.subscription_end >= today);
  const subs = (rows || []).filter(active);
  const ending = subs.filter((r) => r.subscription_end && daysBetween(today, r.subscription_end) <= 7);

  async function setSub(r: Row, days: number, end: string | null) {
    const { data, error } = await supabase.rpc("coach_set_subscription", { p_profile: r.id, p_days: days, p_end: end });
    if (error) return toast.show("ما انحفظ. جربي مرة ثانية.");
    const newEnd = (data as string | null) || null;
    setRows((l) => (l || []).map((x) => (x.id === r.id ? { ...x, subscription_end: newEnd, account_type: newEnd && newEnd >= today ? "subscriber" : "free" } : x)));
    toast.show(newEnd && newEnd >= today ? `✅ مشترك لين ${formatDate(newEnd)}` : "وقفنا الاشتراك");
  }

  async function addCredits(r: Row) {
    const n = (r.photo_credits || 0) + 10;
    const { error } = await supabase.from("profiles").update({ photo_credits: n }).eq("id", r.id);
    if (error) return toast.show("ما انحفظ.");
    setRows((l) => (l || []).map((x) => (x.id === r.id ? { ...x, photo_credits: n } : x)));
    toast.show("+10 صور");
  }

  async function saveSecret(e: FormEvent) {
    e.preventDefault();
    if (secret.trim().length < 8) return toast.show("الصقي المفتاح السري من سلة كامل.");
    const { error } = await supabase.from("salla_config").update({ webhook_secret: secret.trim() }).eq("id", 1);
    if (error) return toast.show("ما انحفظ.");
    setSecret("");
    setSecretSet(true);
    toast.show("✅ انحفظ المفتاح السري");
  }

  async function addMap(e: FormEvent) {
    e.preventDefault();
    const days = Number(digits(newMap.days));
    if ((!newMap.name.trim() && !newMap.id.trim()) || !days) return toast.show("اكتبي اسم المنتج (أو رقمه) والمدة بالأيام.");
    const { data, error } = await supabase
      .from("products_map")
      .insert({ product_name: newMap.name.trim() || null, salla_product_id: digits(newMap.id) || null, option_value: newMap.option.trim() || null, days })
      .select("*")
      .single();
    if (error || !data) return toast.show("ما انحفظ.");
    setMap((l) => [...l, data as MapRow]);
    setNewMap({ name: "", id: "", option: "", days: "30" });
  }

  async function removeMap(id: string) {
    await supabase.from("products_map").delete().eq("id", id);
    setMap((l) => l.filter((x) => x.id !== id));
  }

  if (auth.loading || rows === null) return <Loading />;
  if (!auth.profile) return null;
  const hookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/salla/webhook` : "";

  const card = (r: Row) => {
    const on = active(r);
    return (
      <section key={r.id} className="card stack" style={{ gap: 8 }}>
        <div className="row between wrap">
          <span style={{ minWidth: 0 }}>
            <b>{r.full_name || "بدون اسم"}</b>
            <span className="note" style={{ display: "block" }} dir="ltr">{[r.phone, r.email].filter(Boolean).join(" · ")}</span>
          </span>
          <span className={`chip ${on ? "green" : ""}`}>{on ? `مشترك${r.subscription_end ? ` لين ${formatDate(r.subscription_end)}` : ""}` : r.subscription_end ? `انتهى ${formatDate(r.subscription_end)}` : "مجاني"}</span>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {[30, 90, 365].map((d) => (
            <button key={d} type="button" className="btn btn-s btn-sm" onClick={() => setSub(r, d, null)}>+{d === 30 ? "شهر" : d === 90 ? "٣ شهور" : "سنة"}</button>
          ))}
          <input type="date" className="inp" aria-label="تاريخ النهاية" style={{ width: 150, minHeight: 36 }} onChange={(e) => e.target.value && setSub(r, 0, e.target.value)} />
          {on ? <button type="button" className="btn btn-g btn-sm" onClick={() => setSub(r, 0, null)}>إيقاف</button> : null}
          {!on ? <button type="button" className="btn btn-g btn-sm" onClick={() => addCredits(r)}>📸 +10 صور ({r.photo_credits ?? 0})</button> : null}
        </div>
      </section>
    );
  };

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>الحسابات</h1>
      {missing ? <p className="alert err">شغلي ملف phase13-accounts.sql في Supabase عشان تشتغل الحسابات.</p> : null}
      <div className="grid2">
        <div className="stat"><span>⭐ مشتركين الحين</span><b>{subs.length}</b></div>
        <div className="stat"><span>👥 كل الحسابات</span><b>{rows.length}</b></div>
      </div>

      <div className="sec-title">
        <span className="em" aria-hidden="true">🔎</span>
        <h2>تفعيل يدوي</h2>
      </div>
      <div className="unit">
        <label htmlFor="acc-q" className="sr-only">ابحثي</label>
        <input id="acc-q" className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي بالجوال أو الإيميل أو الاسم" />
        <span><Search size={16} /></span>
      </div>
      {q.trim() ? (shown.length ? shown.map(card) : <p className="note">ما لقينا أحد. لو ما سجل للحين، أول ما يسجل بنفس الجوال يتفعل اشتراكه من سلة تلقائي.</p>) : null}

      {ending.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">⌛</span>
            <h2>اشتراكات تنتهي خلال أسبوع</h2>
          </div>
          {ending.map(card)}
        </>
      ) : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">🛒</span>
        <h2>الربط مع سلة</h2>
      </div>
      <section className="card stack">
        <b className="small">١) رابط الإشعارات (Webhook URL)</b>
        <div className="row" style={{ gap: 6 }}>
          <input className="inp" readOnly dir="ltr" value={hookUrl} aria-label="رابط الإشعارات" style={{ flex: 1, minWidth: 0, fontSize: 13 }} />
          <button type="button" className="btn btn-s btn-sm" onClick={() => { navigator.clipboard?.writeText(hookUrl); toast.show("انسخ الرابط"); }}>نسخ</button>
        </div>
        <b className="small" style={{ marginTop: 6 }}>٢) المفتاح السري (Webhook Secret) {secretSet ? "✅ محفوظ" : ""}</b>
        <form className="row" style={{ gap: 6 }} onSubmit={saveSecret}>
          <input className="inp" dir="ltr" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={secretSet ? "محفوظ، الصقي جديد لو غيرتيه" : "الصقيه من سلة"} aria-label="المفتاح السري" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-p btn-sm" type="submit">احفظي</button>
        </form>
      </section>

      <section className="card stack">
        <b>٣) المنتجات اللي تعطي اشتراك</b>
        <p className="note">اكتبي اسم المنتج بالضبط مثل ما هو في سلة (أو رقمه)، وكم يوم يعطي. لو المدة خيار في المنتج (شهر / ٣ شهور)، اكتبي الخيار في خانة الخيار وسوي سطر لكل خيار. المنتجات اللي مو هنا ما تفعل شي.</p>
        {map.map((m) => (
          <div key={m.id} className="diary-row">
            <span style={{ minWidth: 0 }}>
              <b>{m.product_name || `منتج رقم ${m.salla_product_id}`}</b>
              <span className="note" style={{ display: "block" }}>{m.option_value ? `الخيار: ${m.option_value} · ` : ""}{m.days} يوم</span>
            </span>
            <button type="button" className="icon-btn" aria-label="احذفي" onClick={() => removeMap(m.id)}><Trash2 size={16} /></button>
          </div>
        ))}
        <form className="stack" style={{ gap: 6 }} onSubmit={addMap}>
          <input className="inp" value={newMap.name} onChange={(e) => setNewMap({ ...newMap, name: e.target.value })} placeholder="اسم المنتج في سلة" aria-label="اسم المنتج" />
          <div className="grid3">
            <input className="inp num" value={newMap.id} onChange={(e) => setNewMap({ ...newMap, id: e.target.value })} placeholder="رقمه (اختياري)" aria-label="رقم المنتج" />
            <input className="inp" value={newMap.option} onChange={(e) => setNewMap({ ...newMap, option: e.target.value })} placeholder="الخيار (اختياري)" aria-label="الخيار" />
            <input className="inp num" value={newMap.days} onChange={(e) => setNewMap({ ...newMap, days: e.target.value })} placeholder="الأيام" aria-label="عدد الأيام" />
          </div>
          <button className="btn btn-s" type="submit">أضيفي</button>
        </form>
      </section>

      {pending.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">⏳</span>
            <h2>اشتروا وما سجلوا للحين</h2>
          </div>
          <section className="card" style={{ padding: "4px 16px" }}>
            {pending.map((x) => (
              <div key={x.id} className="diary-row">
                <span style={{ minWidth: 0 }}>
                  <b dir="ltr">{x.phone || x.email}</b>
                  <span className="note" style={{ display: "block" }}>طلب {x.order_id} · {x.product} · {x.days} يوم · يتفعل أول ما يسجل</span>
                </span>
              </div>
            ))}
          </section>
        </>
      ) : null}

      {logs.length ? (
        <details className="gsec">
          <summary>
            <span className="em" aria-hidden="true">📜</span>
            <span><b>سجل إشعارات سلة</b><span className="sub">آخر ٣٠ إشعار</span></span>
          </summary>
          <div className="gbody">
            {logs.map((l) => (
              <div key={l.id} className="small" style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
                <b>{l.order_id ? `طلب ${l.order_id}` : "—"}</b> · {l.status || ""} · {l.result}
                <span className="note" style={{ display: "block" }}>{formatDate(l.created_at)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {toast.node}
    </CoachShell>
  );
}
