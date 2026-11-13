"use client";

import { SecH } from "@/components/SecH";
import { WeekPlates } from "@/components/WeekPlates";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ClientShell, Loading, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/plan-data";
import { saveRow } from "@/lib/offline";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";
import Link from "next/link";
import { CaloriesChart, daysText, useCalorieDays } from "@/components/CaloriesChart";
import { RecsHistory, type RecRow } from "@/components/WeekRecs";
import { Achievements } from "@/components/Achievements";
import { PeriodTracker } from "@/components/PeriodTracker";
import { CoachMessages } from "@/components/CoachMessages";
import { inPeriod } from "@/lib/period";
import { STORE_URL, accountOf } from "@/lib/account";

type Body = { log_date: string; weight_kg: number | null; waist_cm: number | null; hips_cm: number | null; chest_cm?: number | null; arm_cm?: number | null; thigh_cm?: number | null };
type WLog = { id: string; day_title: string | null; created_at: string; duration_sec: number | null; items: { name?: string; sets: { w: number; r: number }[] }[] };
type MKey = "waist_cm" | "hips_cm" | "chest_cm" | "arm_cm" | "thigh_cm";
const MEASURES: { k: MKey; label: string; min: number; max: number }[] = [
  { k: "waist_cm", label: "الخصر", min: 40, max: 250 },
  { k: "hips_cm", label: "الأرداف", min: 50, max: 250 },
  { k: "chest_cm", label: "الصدر", min: 40, max: 250 },
  { k: "arm_cm", label: "الذراع", min: 10, max: 100 },
  { k: "thigh_cm", label: "الفخذ", min: 20, max: 150 }
];

const toNum = (s: string) => {
  const n = parseFloat(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, "."));
  return Number.isFinite(n) ? n : null;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const sign = (v: number) => (v > 0 ? `+${v}` : String(v));
const DAY = 864e5;
const ts = (d: string) => new Date(d + "T12:00:00").getTime();
/** Saturday that starts the week of `d` (weeks run Saturday → Friday, like the check-in). */
function weekOf(d: string) {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
  return x.toISOString().slice(0, 10);
}

type Pt = { d: string; w: number };
type WeekAvg = { wk: string; w: number; t: number };

/** Weekly averages of the weights outside period days. */
function weeklyAverages(steady: Pt[]): WeekAvg[] {
  const m = new Map<string, Pt[]>();
  steady.forEach((p) => m.set(weekOf(p.d), [...(m.get(weekOf(p.d)) || []), p]));
  return Array.from(m.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).map(([wk, ps]) => ({
    wk,
    w: r1(ps.reduce((a, p) => a + p.w, 0) / ps.length),
    t: ps.reduce((a, p) => a + ts(p.d), 0) / ps.length
  }));
}

function WeightChart({ steady, period, weeks, hide = false }: { steady: Pt[]; period: Pt[]; weeks: WeekAvg[]; hide?: boolean }) {
  const W = 340, H = 160, L = 34, R = 12, T = 12, B = 24;
  const all = [...steady, ...period];
  const vals = [...all.map((p) => p.w), ...weeks.map((w) => w.w)];
  const mid = (Math.min(...vals) + Math.max(...vals)) / 2;
  // At least 6 kg on the axis (3 above, 3 below) so small changes don't look big.
  let lo = Math.floor(Math.min(Math.min(...vals) - 0.5, mid - 3)), hi = Math.ceil(Math.max(Math.max(...vals) + 0.5, mid + 3));
  if (hi - lo < 6) hi = lo + 6;
  const times = all.map((p) => ts(p.d));
  const t0 = Math.min(...times), t1 = Math.max(Math.max(...times), t0 + DAY);
  const x = (t: number) => L + ((W - L - R) * (t - t0)) / (t1 - t0);
  const y = (w: number) => T + ((H - T - B) * (hi - w)) / (hi - lo);
  const step = hi - lo > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  // smooth curve through the weekly averages (Catmull-Rom → Bézier)
  const P = weeks.map((p) => [x(p.t), y(p.w)] as const);
  const line = P.map(([px, py], i) => {
    if (!i) return `M${px.toFixed(1)},${py.toFixed(1)}`;
    const p0 = P[i - 2] || P[i - 1], p1 = P[i - 1], p3 = P[i + 1] || [px, py];
    const c1 = [p1[0] + (px - p0[0]) / 6, p1[1] + (py - p0[1]) / 6], c2 = [px - (p3[0] - p1[0]) / 6, py - (p3[1] - p1[1]) / 6];
    return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
  }).join("");
  const area = P.length ? `${line}L${P[P.length - 1][0].toFixed(1)},${H - B}L${P[0][0].toFixed(1)},${H - B}Z` : "";
  const short = (t: number) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(t));
  const lw = weeks[weeks.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={hide ? "منحنى وزنك الأسبوعي" : `متوسط وزنك الأسبوعي من ${weeks[0].w} إلى ${lw.w} كجم`} style={{ direction: "ltr" }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          {hide ? null : <text x={L - 6} y={y(v) + 3} textAnchor="end">{v}</text>}
        </g>
      ))}
      {steady.map((p) => <circle key={p.d} cx={x(ts(p.d))} cy={y(p.w)} r={3} fill="var(--clay)" opacity={0.28}><title>{`${short(ts(p.d))}: ${p.w}`}</title></circle>)}
      {period.map((p) => <circle key={p.d} cx={x(ts(p.d))} cy={y(p.w)} r={4} fill="#F2A27F" opacity={0.85}><title>{`${short(ts(p.d))}: ${p.w} (أيام الدورة)`}</title></circle>)}
      <defs>
        <linearGradient id="wfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--clay)" stopOpacity=".22" />
          <stop offset="1" stopColor="var(--clay)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#wfill)" />
      <path d={line} fill="none" stroke="var(--clay)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      {lw ? <circle cx={x(lw.t)} cy={y(lw.w)} r={10} fill="var(--clay)" opacity={0.2} className="w-glow" /> : null}
      {weeks.map((p) => <circle key={p.wk} cx={x(p.t)} cy={y(p.w)} r={4} fill="var(--clay)" stroke="var(--surface)" strokeWidth={2}><title>{`متوسط أسبوع ${short(ts(p.wk))}: ${p.w}`}</title></circle>)}
      <text x={L} y={H - 6} textAnchor="start">{short(t0)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{short(t1)}</text>
    </svg>
  );
}

export default function ProgressPage() {
  const auth = useAuthGuard("client");
  // «+» → «وزن اليوم» opens here with the weight box ready.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("weight") !== "1") return;
    const t = setTimeout(() => {
      const el = document.getElementById("w") as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 700);
    return () => clearTimeout(t);
  }, []);
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const cal = useCalorieDays(cp.client?.id, cp.mealRow || null, 7);
  const [body, setBody] = useState<Body[]>([]);
  const [wlogs, setWlogs] = useState<WLog[]>([]);
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [checkedToday, setCheckedToday] = useState(false);
  const [ready, setReady] = useState(false);
  const [weight, setWeight] = useState("");
  const [measOpen, setMeasOpen] = useState(false);
  const [meas, setMeas] = useState<Record<MKey, string>>({ waist_cm: "", hips_cm: "", chest_cm: "", arm_cm: "", thigh_cm: "" });

  const load = useCallback(async () => {
    if (!cp.client || !auth.profile) return;
    const [{ data: b }, { data: w }, { data: r }, { data: f }] = await Promise.all([
      supabase.from("body_logs").select("*").eq("client_id", cp.client.id).order("log_date", { ascending: true }),
      supabase.from("workout_logs").select("id, day_title, created_at, duration_sec, items").eq("client_id", cp.client.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("weekly_recs").select("id, week_end, recs, status").eq("profile_id", auth.profile.id).eq("status", "published").order("week_end", { ascending: false }).limit(12),
      supabase.from("weekly_followups").select("created_at").eq("client_id", cp.client.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    setBody((b as Body[] | null) || []);
    setWlogs((w as WLog[] | null) || []);
    setRecs((r as RecRow[] | null) || []);
    const last = (f as { created_at: string } | null)?.created_at;
    setCheckedToday(Boolean(last && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(last)) === todayKey()));
  }, [cp.client, auth.profile]);

  useEffect(() => {
    if (cp.loading) return;
    load().then(() => setReady(true));
  }, [cp.loading, load]);

  async function upsert(patch: Partial<Body>, msg: string) {
    if (!cp.client) return false;
    const today = todayKey();
    const existing = body.find((x) => x.log_date === today);
    const r = await saveRow("body_logs", { client_id: cp.client.id, log_date: today, ...patch }, "client_id,log_date");
    if (!r.ok) {
      toast.show("ما انحفظ. تأكدي من الاتصال وجربي مرة ثانية.");
      return false;
    }
    if (r.queued) {
      setBody((b) => [...b.filter((x) => x.log_date !== today), { ...(existing || { log_date: today, weight_kg: null, waist_cm: null, hips_cm: null }), ...patch }].sort((a, c) => (a.log_date < c.log_date ? -1 : 1)));
      toast.show(`${msg} (في جوالك لين يرجع النت)`);
      return true;
    }
    toast.show(msg);
    await load();
    return true;
  }

  async function saveWeight(e: FormEvent) {
    e.preventDefault();
    const w = toNum(weight);
    if (!w || w < 30 || w > 250) return toast.show("اكتبي وزنك بالكيلو، مثلا 67.5");
    if (await upsert({ weight_kg: w }, "سجلنا وزنك")) setWeight("");
  }

  async function saveMeasures(e: FormEvent) {
    e.preventDefault();
    const patch: Partial<Body> = {};
    for (const m of MEASURES) {
      if (!meas[m.k].trim()) continue;
      const v = toNum(meas[m.k]);
      if (!v || v < m.min || v > m.max) return toast.show(`اكتبي ${m.label} بالسنتيمتر`);
      patch[m.k] = v;
    }
    if (!Object.keys(patch).length) return toast.show("اكتبي قياس واحد على الأقل");
    if (await upsert(patch, "حفظنا قياساتك")) {
      setMeas({ waist_cm: "", hips_cm: "", chest_cm: "", arm_cm: "", thigh_cm: "" });
      setMeasOpen(false);
    }
  }

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;
  const sub = accountOf(auth.profile).sub;
  const hide = Boolean(auth.profile.hide_numbers);
  const today = todayKey();

  // Weight: period-day weights are shown apart and left out of every change.
  const isPeriodDay = (d: string) => inPeriod(cp.periods, d);
  const weights: Pt[] = body.filter((b) => b.weight_kg).map((b) => ({ d: b.log_date, w: Number(b.weight_kg) }));
  const steady = weights.filter((x) => !isPeriodDay(x.d));
  const period = weights.filter((x) => isPeriodDay(x.d));
  const weeks = weeklyAverages(steady);
  const lastW = weights[weights.length - 1] || null;
  const fromStart = weeks.length > 1 ? r1(weeks[weeks.length - 1].w - weeks[0].w) : null;
  const thisWk = weeks.find((w) => w.wk === weekOf(today));
  const prevWk = weeks.find((w) => w.wk === weekOf(new Date(ts(today) - 7 * DAY).toISOString().slice(0, 10)));
  const weekChange = thisWk && prevWk ? r1(thisWk.w - prevWk.w) : null;

  // This week (last 7 days): days with food logged and their average.
  const loggedDays = (cal.rows || []).filter((r) => r.cal > 0 && !r.off);
  const avgCal = loggedDays.length ? Math.round(loggedDays.reduce((a, r) => a + r.cal, 0) / loggedDays.length) : null;
  const saturday = new Date(today + "T12:00:00").getDay() === 6;

  // Measurements: the latest of each and the change from the first.
  const measRows = MEASURES.map((m) => {
    const vals = body.filter((b) => b[m.k]).map((b) => Number(b[m.k]));
    return vals.length ? { ...m, last: vals[vals.length - 1], diff: vals.length > 1 ? r1(vals[vals.length - 1] - vals[0]) : null } : null;
  }).filter(Boolean) as ((typeof MEASURES)[number] & { last: number; diff: number | null })[];
  const lastMeas = [...body].reverse().find((b) => MEASURES.some((m) => b[m.k]));
  // Achievements: a full plate (90%+ of the goal) this week, and a new top weight in the last workout.
  const fullDay = Boolean(cal.target && (cal.rows || []).some((r) => !r.off && r.cal >= cal.target! * 0.9 && r.cal <= cal.target! * 1.1));
  const newPr = (() => {
    const [last, ...older] = wlogs;
    if (!last) return null;
    let best: { name: string; w: number } | null = null;
    for (const it of last.items) {
      if (!it.name) continue;
      const top = Math.max(0, ...it.sets.map((x) => Number(x.w) || 0));
      const before = Math.max(0, ...older.flatMap((l) => l.items.filter((y) => y.name === it.name).flatMap((y) => y.sets.map((x) => Number(x.w) || 0))));
      if (top > 0 && before > 0 && top > before && (!best || top - before > best.w)) best = { name: it.name, w: top };
    }
    return best;
  })();
  const vol = (l: WLog) => Math.round(l.items.reduce((a, it) => a + it.sets.reduce((b, s) => b + s.w * s.r, 0), 0));

  return (
    <ClientShell title="تقدمي">
      {/* 1. This week */}
      <SecH icon="week" title="هالأسبوع" />
      {sub && saturday && !checkedToday ? (
        <Link href="/app/checkin" className="photo-hero plain" style={{ textDecoration: "none" }}>
          <span className="kicker">اليوم السبت</span>
          <h2>سجلي تسجيلك الأسبوعي</h2>
          <p>وزنك وقياساتك وكيف كان أسبوعك، والمدربة ترد عليك.</p>
          <span className="btn btn-p btn-block">ابدئي التسجيل</span>
        </Link>
      ) : (
        <section className="card">
          <div className="wk-now">
            {hide ? null : <div><small>تغير الوزن</small><b className="num"><span dir="ltr">{weekChange !== null ? `${sign(weekChange)}` : "—"}</span></b><small>{weekChange !== null ? "كجم عن الأسبوع اللي قبل" : "يحتاج وزن الأسبوعين"}</small></div>}
            <div><small>أيام الالتزام</small><b className="num">{loggedDays.length}<span className="small muted"> من 7</span></b><small>أيام سجلتي أكلك</small></div>
            {hide ? null : <div><small>متوسط السعرات</small><b className="num">{avgCal ?? "—"}</b><small>{avgCal ? `في ${daysText(loggedDays.length)}` : "ما سجلتي أكل"}</small></div>}
          </div>
        </section>
      )}

      {/* 2. The week's plates */}
      <WeekPlates rows={cal.rows} target={cal.target} />

      {/* 3. Coach */}
      {sub && cp.client ? <CoachMessages clientId={cp.client.id} /> : null}
      <RecsHistory rows={recs} />

      {/* 3. Weight */}
      <SecH icon="weight" title="الوزن" />
      <section className="card stack">
        {hide ? null : <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <span className="label">{weeks.length ? "متوسط هالأسبوع" : "آخر وزن"}</span>
            <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
              <b className="num" style={{ fontSize: 40, lineHeight: 1.1, color: "var(--navy)" }}>{weeks.length ? weeks[weeks.length - 1].w : lastW?.w ?? "—"}</b>
              <span className="muted">كجم</span>
            </div>
          </div>
          <div style={{ textAlign: "end" }}>
            {weekChange !== null ? <b className="num" dir="ltr" style={{ fontSize: 18, color: weekChange <= 0 ? "var(--navy)" : "var(--clay)" }}>{sign(weekChange)}</b> : null}
            {weekChange !== null ? <span className="label" style={{ display: "block" }}>عن الأسبوع اللي قبل</span> : null}
            {fromStart !== null && fromStart !== 0 ? <span className="label" style={{ display: "block" }}><span dir="ltr">{sign(fromStart)}</span> كجم من البداية</span> : null}
          </div>
        </div>}
        {weeks.length > 1 ? (
          <>
            <WeightChart steady={steady} period={period} weeks={weeks} hide={hide} />
            <p className="note">الخط متوسط كل أسبوع، والنقاط الفاتحة أوزانك اليومية.{period.length ? " النقاط البرتقالية الفاتحة أيام الدورة، ما تدخل في الخط ولا في الفرق." : ""}</p>
          </>
        ) : (
          <p className="note">سجلي وزنك أسبوعين عشان يطلع لك الرسم.</p>
        )}
        {lastW && isPeriodDay(lastW.d) ? <p className="note">🌸 آخر وزن في أيام الدورة، ما حسبناه في التغير.</p> : null}
        <form className="row" onSubmit={saveWeight} style={{ gap: 8 }}>
          <div className="unit" style={{ flex: 1 }}>
            <label htmlFor="w" className="sr-only">وزن اليوم</label>
            <input id="w" className="inp num" inputMode="decimal" placeholder="وزن اليوم" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span>كجم</span>
          </div>
          <button className="btn btn-p" type="submit">سجلي</button>
        </form>
        <p className="note">وزني نفسك الصبح بعد الحمام وقبل الأكل، وقارني أسبوع بأسبوع مو يوم بيوم.</p>
      </section>

      {/* 4. Measurements */}
      {sub ? (
        <>
          <SecH icon="measure" title="القياسات" aside={lastMeas ? <span className="small muted">آخر قياس {formatDate(lastMeas.log_date)}</span> : null} />
          <section className="card stack">
            {measRows.length ? (
              <div className="meas-rows">
                {measRows.map((m) => (
                  <div key={m.k} className="meas-row">
                    <span>{m.label}</span>
                    <b className="num">{m.last} سم</b>
                    <span className={`meas-diff ${m.diff !== null && m.diff < 0 ? "down" : ""}`}>{m.diff !== null ? <><span className="num" dir="ltr">{sign(m.diff)}</span> من البداية</> : "أول قياس"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">قيسي خصرك وأردافك مرة كل أسبوعين. الشريط يكشف تغييرات ما يبينها الميزان.</p>
            )}
            {measOpen ? (
              <form className="stack" onSubmit={saveMeasures}>
                <div className="grid2">
                  {MEASURES.map((m, i) => (
                    <div key={m.k} className="field">
                      <label htmlFor={m.k}>{m.label} (سم){i > 1 ? <span className="muted"> اختياري</span> : null}</label>
                      <input id={m.k} className="inp num" inputMode="decimal" value={meas[m.k]} onChange={(e) => setMeas({ ...meas, [m.k]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-p" type="submit" style={{ flex: 1 }}>حفظ القياس</button>
                  <button className="btn btn-g" type="button" onClick={() => setMeasOpen(false)}>إلغاء</button>
                </div>
              </form>
            ) : (
              <button type="button" className="btn btn-s btn-block" onClick={() => setMeasOpen(true)}>📏 قياس جديد</button>
            )}
          </section>
        </>
      ) : null}

      {/* 5. Calories, 6. Achievements, 7. Period */}
      <CaloriesChart rows={cal.rows} target={cal.target} hide={hide} />
      {cp.client ? (
        <>
          <Achievements clientId={cp.client.id} pr={newPr} plateCard={fullDay ? { kind: "week", on: (cal.rows || []).map((r) => r.cal > 0 && !r.off), avgCal: avgCal, avgP: null, workouts: null, weight: null } : null} />
          {auth.profile.gender !== "male" ? <PeriodTracker clientId={cp.client.id} periods={cp.periods} onChange={cp.reload} /> : null}
        </>
      ) : null}

      {/* 8. Workouts (only with a workout plan) */}
      {sub && cp.workout ? (
        <>
          <SecH icon="workout" title="آخر التمارين" />
          <section className="card">
            {wlogs.length ? (
              wlogs.map((l, i) => (
                <div key={l.id} className="row between" style={{ padding: "11px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                  <span>
                    <b style={{ fontWeight: 600 }}>{l.day_title || "تمرين"}</b>
                    <br />
                    <span className="small muted">{formatDate(l.created_at)}{l.duration_sec ? ` · ${Math.round(l.duration_sec / 60)} دقيقة` : ""}</span>
                  </span>
                  <span className="small muted num">{vol(l)} كجم</span>
                </div>
              ))
            ) : (
              <div className="empty-mini" style={{ boxShadow: "none", padding: 0 }}>
                <p className="small muted">تمارينك اللي تخلصينها تطلع هنا مع المدة والأوزان. أول خطوة: ابدئي تمرين اليوم.</p>
                <a className="btn btn-s btn-sm" href="/app/workout">ابدئي أول تمرين</a>
              </div>
            )}
          </section>
        </>
      ) : sub ? null : (
        <a className="offer-card" href={STORE_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true" style={{ fontSize: 30 }}>📏</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <b>تابعي قياساتك وصورك وتمارينك</b>
            <span>مع الاشتراك: القياسات، ورسائل المدربة، وتسجيل أسبوعي كل سبت، وسجل تمارينك.</span>
          </span>
        </a>
      )}
      {toast.node}
    </ClientShell>
  );
}
