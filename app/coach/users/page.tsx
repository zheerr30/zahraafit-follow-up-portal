"use client";

import { WEEKDAYS } from "@/lib/off-days";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CoachShell, Loading } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";

type User = {
  profile_id: string; client_id: string | null; full_name: string | null; phone: string | null; gender: string | null; account_type: string | null;
  subscription_end: string | null; created_at: string; last_seen_at: string | null; days_this_week: number; last_checkin: string | null;
};
type Report = { id: string; profile_id: string; body: string; photo_path: string | null; device: { ua?: string; platform?: string; screen?: string; standalone?: boolean }; page: string | null; app_version: string | null; status: string; created_at: string; url?: string };
type Stats = { daily: { day: string; people: number }[]; pages: { name: string; n: number; people: number }[]; taps: { name: string; n: number; people: number }[] };

const PAGE_NAMES: Record<string, string> = {
  "/app": "الرئيسية", "/app/food": "أكلي", "/app/workout": "تماريني", "/app/progress": "تقدمي", "/app/guide": "دليلك", "/app/account": "حسابي",
  "/app/checkin": "التسجيل الأسبوعي", "/app/intake": "استمارة الخطة", "/app/start": "أول تسجيل", "/app/print/[id]": "ملف الخطة"
};
const TAP_NAMES: Record<string, string> = {
  "water:add": "إضافة كوب ماء", "food:photo": "صوري صحنك", "food:barcode": "مسح باركود", "workout:finish": "خلصت التمرين", "checkin:submit": "إرسال التسجيل الأسبوعي"
};
const CARD: Record<string, string> = { day: "ملخص اليوم", meal: "وجبة", week: "الأسبوع", workout: "تمرين", streak: "الالتزام", weight: "الوزن" };
const tapName = (n: string) => {
  if (TAP_NAMES[n]) return TAP_NAMES[n];
  const [k, v] = n.split(":");
  const verb: Record<string, string> = { share: "مشاركة", save: "حفظ صورة", sticker: "نسخ ستيكر" };
  return verb[k] ? `${verb[k]}: ${CARD[v] || v}` : n;
};
const DAY = 864e5;

function ago(iso: string | null) {
  if (!iso) return "ما فتح التطبيق بعد";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (d <= 0) return "اليوم";
  if (d === 1) return "أمس";
  if (d === 2) return "قبل يومين";
  return `قبل ${d} ${d <= 10 ? "أيام" : "يوم"}`;
}
function waLink(phone: string | null, name: string | null, male: boolean) {
  const d = (phone || "").replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, "");
  const num = d.startsWith("05") ? `966${d.slice(1)}` : d.startsWith("5") && d.length === 9 ? `966${d}` : d.startsWith("00") ? d.slice(2) : d;
  if (num.length < 10) return null;
  const first = (name || "").split(" ")[0];
  const text = male
    ? `هلا ${first}، معك زهراء من ZahraaFit 👋 اشتقنا لك! كيف ماشي معك الأكل والتمرين؟ افتح التطبيق وسجل يومك، وأنا معك لو احتجت شي.`
    : `هلا ${first}، معك زهراء من ZahraaFit 👋 اشتقنا لك! كيف ماشي معك الأكل والتمرين؟ افتحي التطبيق وسجلي يومك، وأنا معك لو احتجتي شي.`;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** Coach: everyone at a glance, problem reports, and usage stats. */
export default function UsersPage() {
  const auth = useAuthGuard("admin");
  const [tab, setTab] = useState<"users" | "reports" | "stats">("users");
  const [users, setUsers] = useState<User[] | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<"all" | "idle" | "sub" | "free">("all");
  const [missing, setMissing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [offs, setOffs] = useState<Map<string, { limit: number; weekday: number | null; days: string[] }>>(new Map());

  const load = useCallback(async () => {
    const [{ data: u, error }, { data: r }] = await Promise.all([
      supabase.rpc("coach_users"),
      supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100)
    ]);
    if (error) setMissing(true);
    setUsers((u as User[] | null) || []);
    // Off days: each subscriber's weekly limit, the plan's fixed free day, and this week's picks.
    const since = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
    const [{ data: cs }, { data: od }] = await Promise.all([
      supabase.from("clients").select("id, off_limit, off_weekday"),
      supabase.from("off_days").select("client_id, day").gte("day", since).order("day")
    ]);
    const m = new Map<string, { limit: number; weekday: number | null; days: string[] }>();
    ((cs as { id: string; off_limit?: number; off_weekday?: number | null }[] | null) || []).forEach((c) => m.set(c.id, { limit: c.off_limit ?? 1, weekday: c.off_weekday ?? null, days: [] }));
    ((od as { client_id: string; day: string }[] | null) || []).forEach((o) => m.get(o.client_id)?.days.push(o.day));
    setOffs(m);
    const reps = (r as Report[] | null) || [];
    setReports(await Promise.all(reps.map(async (x) => {
      if (!x.photo_path) return x;
      const { data } = await supabase.storage.from("reports").createSignedUrl(x.photo_path, 3600);
      return { ...x, url: data?.signedUrl };
    })));
  }, []);
  useEffect(() => {
    if (auth.profile) load();
  }, [auth.profile, load]);
  useEffect(() => {
    if (auth.profile && tab === "stats") supabase.rpc("coach_stats", { p_days: days }).then(({ data }) => setStats((data as Stats | null) || null));
  }, [auth.profile, tab, days]);

  const names = useMemo(() => new Map((users || []).map((u) => [u.profile_id, u.full_name || "مشتركة"])), [users]);
  const idle = (u: User) => !u.last_seen_at || Date.now() - new Date(u.last_seen_at).getTime() > 3 * DAY;
  const shown = (users || []).filter((u) => filter === "all" || (filter === "idle" ? idle(u) : filter === "sub" ? u.account_type === "subscriber" : u.account_type !== "subscriber"));
  const newReports = reports.filter((r) => r.status === "new");

  if (auth.loading || !users) return <Loading />;

  async function markDone(r: Report) {
    await supabase.from("reports").update({ status: r.status === "new" ? "done" : "new" }).eq("id", r.id);
    setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: x.status === "new" ? "done" : "new" } : x)));
  }

  return (
    <CoachShell>
      <div className="row between wrap">
        <h1 style={{ fontSize: 24 }}>المستخدمين</h1>
        <span className="chip">👥 {users.length}</span>
      </div>
      {missing ? <p className="alert err">شغلي ملف phase19-basics.sql في Supabase عشان تشتغل هالصفحة.</p> : null}
      <div className="seg-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")}>المستخدمين</button>
        <button type="button" role="tab" aria-selected={tab === "reports"} onClick={() => setTab("reports")}>البلاغات{newReports.length ? ` (${newReports.length})` : ""}</button>
        <button type="button" role="tab" aria-selected={tab === "stats"} onClick={() => setTab("stats")}>الإحصائيات</button>
      </div>

      {tab === "users" ? (
        <>
          <div className="chip-toggles">
            {([["all", "الكل"], ["idle", `ما فتح من 3 أيام (${users.filter(idle).length})`], ["sub", "مشتركين"], ["free", "مجاني"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <section className="card" style={{ padding: "2px 14px" }}>
            {shown.length ? shown.map((u) => {
              const wa = idle(u) ? waLink(u.phone, u.full_name, u.gender === "male") : null;
              return (
                <div key={u.profile_id} className="u-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b>{u.full_name || "بدون اسم"}</b> <span className={`chip ${u.account_type === "subscriber" ? "on" : ""}`}>{u.account_type === "subscriber" ? "مشتركة" : "مجاني"}</span>
                    <div className="u-meta">
                      <span className={idle(u) ? "warn" : ""}>👁️ آخر دخول: {ago(u.last_seen_at)}</span>
                      <span>✅ التزام هالأسبوع: <b className="num">{u.days_this_week}</b> من 7</span>
                      <span>📅 آخر تسجيل سبت: {u.last_checkin ? formatDate(u.last_checkin) : "ما سجلت"}</span>
                      {u.client_id && offs.get(u.client_id)?.days.length ? <span>😌 أوف: {offs.get(u.client_id)!.days.map((d) => formatDate(d)).join("، ")}</span> : null}
                    </div>
                    {u.client_id && offs.has(u.client_id) ? (
                      <div className="off-ctrl">
                        <label>أيام أوف بالأسبوع
                          <select className="inp" value={offs.get(u.client_id)!.limit} onChange={async (e) => {
                            const v = Number(e.target.value);
                            const { error: er } = await supabase.from("clients").update({ off_limit: v }).eq("id", u.client_id!);
                            if (!er) setOffs((m) => new Map(m).set(u.client_id!, { ...m.get(u.client_id!)!, limit: v }));
                          }}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                        </label>
                        {u.account_type === "subscriber" ? (
                          <label>يوم حر ثابت
                            <select className="inp" value={offs.get(u.client_id)!.weekday ?? ""} onChange={async (e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              const { error: er } = await supabase.from("clients").update({ off_weekday: v }).eq("id", u.client_id!);
                              if (!er) setOffs((m) => new Map(m).set(u.client_id!, { ...m.get(u.client_id!)!, weekday: v }));
                            }}>
                              <option value="">بدون</option>
                              {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {wa ? <a className="btn btn-s btn-sm" href={wa} target="_blank" rel="noreferrer">💬 أرسلي رسالة</a> : idle(u) ? <span className="note">ما فيه رقم</span> : null}
                </div>
              );
            }) : <p className="note" style={{ padding: 14 }}>ما فيه أحد هنا.</p>}
          </section>
          <p className="note">«آخر دخول» يبدأ يتسجل من بعد هالتحديث. الرسالة تفتح واتساب برسالة جاهزة تقدرين تعدلينها.</p>
        </>
      ) : null}

      {tab === "reports" ? (
        <>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={showDone} onChange={() => setShowDone(!showDone)} style={{ width: 20, height: 20, accentColor: "var(--clay)" }} />
            <span className="small">أظهري البلاغات اللي خلصت</span>
          </label>
          {reports.filter((r) => showDone || r.status === "new").map((r) => (
            <section key={r.id} className={`card stack ${r.status === "done" ? "muted-card" : ""}`}>
              <div className="row between wrap">
                <b>{names.get(r.profile_id) || "مستخدم"}</b>
                <span className="small muted">{formatDate(r.created_at)}</span>
              </div>
              <p style={{ whiteSpace: "pre-line", margin: 0 }}>{r.body}</p>
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt="صورة البلاغ" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12 }} /></a> : null}
              <span className="note" dir="ltr" style={{ textAlign: "left", overflowWrap: "anywhere" }}>
                {[r.device?.platform, r.device?.screen, r.device?.standalone ? "installed app" : "browser", r.app_version ? `v ${r.app_version}` : null].filter(Boolean).join(" · ")}
                <br />{r.device?.ua}
              </span>
              <button type="button" className="btn btn-s btn-sm" onClick={() => markDone(r)}>{r.status === "new" ? "✓ خلصت" : "رجعيها جديدة"}</button>
            </section>
          ))}
          {!reports.some((r) => showDone || r.status === "new") ? <p className="note">ما فيه بلاغات جديدة 👌</p> : null}
        </>
      ) : null}

      {tab === "stats" ? (
        stats ? (
          <>
            <div className="chip-toggles">
              {[7, 14, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>آخر {n} يوم</button>)}
            </div>
            <div className="sec-h"><h2>👥 المستخدمين النشطين يوميا</h2></div>
            <section className="card">
              {stats.daily.length ? (
                <div className="dau" role="img" aria-label="عدد المستخدمين النشطين كل يوم">
                  {stats.daily.map((d) => {
                    const max = Math.max(...stats.daily.map((x) => x.people), 1);
                    return (
                      <div key={d.day} title={`${d.day}: ${d.people}`}>
                        <small className="num">{d.people}</small>
                        <i style={{ height: `${(d.people / max) * 100}%` }} />
                        <small className="num">{new Date(d.day + "T12:00:00").getDate()}</small>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="note">ما فيه بيانات للحين. تبدأ تتجمع من بعد هالتحديث.</p>}
            </section>
            <div className="sec-h"><h2>📄 أكثر الصفحات استخداما</h2></div>
            <section className="card" style={{ padding: "2px 14px" }}>
              {stats.pages.map((p) => (
                <div key={p.name} className="u-row"><span style={{ flex: 1 }}>{PAGE_NAMES[p.name] || p.name}</span><span className="small muted"><b className="num">{p.n}</b> فتحة · <b className="num">{p.people}</b> مستخدم يومي</span></div>
              ))}
              {!stats.pages.length ? <p className="note" style={{ padding: 14 }}>ما فيه بيانات للحين.</p> : null}
            </section>
            <div className="sec-h"><h2>👆 أكثر الأزرار استخداما</h2></div>
            <section className="card" style={{ padding: "2px 14px" }}>
              {stats.taps.map((p) => (
                <div key={p.name} className="u-row"><span style={{ flex: 1 }}>{tapName(p.name)}</span><span className="small muted"><b className="num">{p.n}</b> مرة</span></div>
              ))}
              {!stats.taps.length ? <p className="note" style={{ padding: 14 }}>ما فيه بيانات للحين.</p> : null}
            </section>
            <p className="note">الإحصائيات بدون أسماء: كل شخص يتحسب برمز يتغير كل يوم، فتشوفين كم شخص استخدم التطبيق بس مو مين.</p>
          </>
        ) : <Loading />
      ) : null}
    </CoachShell>
  );
}
