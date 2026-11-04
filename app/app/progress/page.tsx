"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ClientShell, Loading, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { normalizeAnswers } from "@/lib/intake";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";

type Body = { log_date: string; weight_kg: number | null; waist_cm: number | null; hips_cm: number | null };
type WLog = { id: string; day_title: string | null; created_at: string; duration_sec: number | null; items: { sets: { w: number; r: number }[] }[] };

const toNum = (s: string) => {
  const n = parseFloat(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, "."));
  return Number.isFinite(n) ? n : null;
};

function Chart({ pts }: { pts: { d: string; w: number }[] }) {
  if (pts.length < 2) return <p className="note">الرسم يطلع بعد ما تسجلين وزنك مرتين.</p>;
  const W = 340, H = 150, L = 34, R = 10, T = 12, B = 24;
  const ts = pts.map((p) => new Date(p.d + "T12:00").getTime());
  const ws = pts.map((p) => p.w);
  let lo = Math.floor(Math.min(...ws) - 0.5), hi = Math.ceil(Math.max(...ws) + 0.5);
  if (hi - lo < 2) hi = lo + 2;
  const t0 = ts[0], t1 = Math.max(ts[ts.length - 1], t0 + 864e5);
  const x = (t: number) => L + ((W - L - R) * (t - t0)) / (t1 - t0);
  const y = (w: number) => T + ((H - T - B) * (hi - w)) / (hi - lo);
  const step = hi - lo > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p.w).toFixed(1)}`).join("");
  const last = pts.length - 1;
  const short = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(d + "T12:00"));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`الوزن من ${ws[0]} إلى ${ws[last]} كجم`} style={{ direction: "ltr" }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      <path d={`${line}L${x(ts[last]).toFixed(1)},${H - B}L${x(ts[0]).toFixed(1)},${H - B}Z`} fill="var(--clay)" opacity={0.1} />
      <path d={line} fill="none" stroke="var(--clay)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ts[last])} cy={y(ws[last])} r={4.5} fill="var(--clay)" stroke="var(--surface)" strokeWidth={2} />
      <text x={L} y={H - 6} textAnchor="start">{short(pts[0].d)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{short(pts[last].d)}</text>
    </svg>
  );
}

export default function ProgressPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const [body, setBody] = useState<Body[]>([]);
  const [wlogs, setWlogs] = useState<WLog[]>([]);
  const [startWeight, setStartWeight] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");

  const load = useCallback(async () => {
    if (!cp.client) return;
    const [{ data: b }, { data: w }, { data: r }] = await Promise.all([
      supabase.from("body_logs").select("log_date, weight_kg, waist_cm, hips_cm").eq("client_id", cp.client.id).order("log_date", { ascending: true }),
      supabase.from("workout_logs").select("id, day_title, created_at, duration_sec, items").eq("client_id", cp.client.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("plan_requests").select("answers").eq("client_id", cp.client.id).order("submitted_at", { ascending: true }).limit(1).maybeSingle()
    ]);
    setBody((b as Body[] | null) || []);
    setWlogs((w as WLog[] | null) || []);
    setStartWeight(r ? normalizeAnswers(r.answers).weight_kg : null);
  }, [cp.client]);

  useEffect(() => {
    if (cp.loading) return;
    load().then(() => setReady(true));
  }, [cp.loading, load]);

  async function upsert(patch: Partial<Body>, msg: string) {
    if (!cp.client) return false;
    const today = todayKey();
    const existing = body.find((x) => x.log_date === today);
    const { error } = await supabase
      .from("body_logs")
      .upsert({ client_id: cp.client.id, log_date: today, weight_kg: existing?.weight_kg ?? null, waist_cm: existing?.waist_cm ?? null, hips_cm: existing?.hips_cm ?? null, ...patch }, { onConflict: "client_id,log_date" });
    if (error) {
      toast.show("ما انحفظ. تأكدي من الاتصال وجربي مرة ثانية.");
      return false;
    }
    toast.show(msg);
    await load();
    return true;
  }

  async function saveWeight(e: FormEvent) {
    e.preventDefault();
    const w = toNum(weight);
    if (!w || w < 30 || w > 250) return toast.show("اكتبي وزنك بالكيلو، مثلًا 67.5");
    if (await upsert({ weight_kg: w }, "سجّلنا وزنك")) setWeight("");
  }

  async function saveMeasures(e: FormEvent) {
    e.preventDefault();
    const a = toNum(waist), h = toNum(hips);
    if (!a || !h || a < 40 || h < 50) return toast.show("اكتبي الخصر والأرداف بالسنتيمتر");
    if (await upsert({ waist_cm: a, hips_cm: h }, "حفظنا قياساتك")) {
      setWaist("");
      setHips("");
    }
  }

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;

  const weights = body.filter((b) => b.weight_kg).map((b) => ({ d: b.log_date, w: Number(b.weight_kg) }));
  const pts = weights;
  const cur = weights.length ? weights[weights.length - 1].w : startWeight;
  const base = startWeight ?? (weights[0]?.w || null);
  const diff = cur !== null && base !== null ? Math.round((cur - base) * 10) / 10 : null;
  const meas = body.filter((b) => b.waist_cm && b.hips_cm);
  const m0 = meas[0], m1 = meas[meas.length - 1];
  const sign = (v: number) => (v > 0 ? `+${v}` : String(v));
  const vol = (l: WLog) => Math.round(l.items.reduce((a, it) => a + it.sets.reduce((b, s) => b + s.w * s.r, 0), 0));

  return (
    <ClientShell title="تقدّمي">
      <section className="card stack">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <span className="label">وزنك الحالي</span>
            <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
              <b className="num" style={{ fontSize: 36, lineHeight: 1.1 }}>{cur ?? "—"}</b>
              <span className="muted">كجم</span>
            </div>
          </div>
          {diff !== null && diff !== 0 ? <span className="chip" dir="ltr">{sign(diff)} كجم من البداية</span> : null}
        </div>
        <Chart pts={pts} />
        <form className="row" onSubmit={saveWeight} style={{ gap: 8 }}>
          <div className="unit" style={{ flex: 1 }}>
            <label htmlFor="w" className="sr-only">وزن اليوم</label>
            <input id="w" className="inp num" inputMode="decimal" placeholder="وزن اليوم" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span>كجم</span>
          </div>
          <button className="btn btn-p" type="submit">سجّلي</button>
        </form>
        <p className="note">وزني نفسك الصبح بعد الحمام وقبل الأكل، وقارني أسبوع بأسبوع مو يوم بيوم.</p>
      </section>

      <div className="sec-h">
        <h2>القياسات</h2>
        {m1 ? <span className="small muted">آخر قياس {formatDate(m1.log_date)}</span> : null}
      </div>
      <section className="card stack">
        {m1 ? (
          <div className="grid2">
            <div className="stat"><span>الخصر</span><b>{m1.waist_cm} سم</b><span dir="ltr">{meas.length > 1 ? `${sign(Math.round((Number(m1.waist_cm) - Number(m0.waist_cm)) * 10) / 10)} سم` : "أول قياس"}</span></div>
            <div className="stat"><span>الأرداف</span><b>{m1.hips_cm} سم</b><span dir="ltr">{meas.length > 1 ? `${sign(Math.round((Number(m1.hips_cm) - Number(m0.hips_cm)) * 10) / 10)} سم` : "أول قياس"}</span></div>
          </div>
        ) : (
          <p className="small muted">قيسي خصرك وأردافك مرة كل أسبوعين. الشريط يكشف تغييرات ما يبينها الميزان.</p>
        )}
        <form className="grid2" onSubmit={saveMeasures} style={{ alignItems: "end" }}>
          <div className="field"><label htmlFor="waist">الخصر (سم)</label><input id="waist" className="inp num" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} /></div>
          <div className="field"><label htmlFor="hips">الأرداف (سم)</label><input id="hips" className="inp num" inputMode="decimal" value={hips} onChange={(e) => setHips(e.target.value)} /></div>
          <button className="btn btn-s" type="submit" style={{ gridColumn: "1 / -1" }}>حفظ القياس</button>
        </form>
      </section>

      <div className="sec-h"><h2>آخر التمارين</h2></div>
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
          <p className="small muted">أول تمرين تخلصينه بيطلع هنا.</p>
        )}
      </section>
      {toast.node}
    </ClientShell>
  );
}
