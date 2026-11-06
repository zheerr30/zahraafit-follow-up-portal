"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/followup";
import { currentPeriod, periodEnd, type PeriodLog } from "@/lib/period";
import { daysText } from "@/components/CaloriesChart";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

const PINK = "#D4537E";
const DAY = 864e5;
const diffDays = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / DAY);
const shortDate = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" }).format(new Date(d + "T12:00:00"));

/** Average days between the starts of her last 3 cycles (28 when there isn't enough). */
export function cycleLength(periods: PeriodLog[]) {
  const starts = [...periods].map((p) => p.start_date).sort().reverse();
  const gaps: number[] = [];
  for (let i = 0; i + 1 < starts.length && gaps.length < 3; i++) {
    const g = diffDays(starts[i + 1], starts[i]);
    if (g >= 18 && g <= 60) gaps.push(g);
  }
  return gaps.length ? Math.round(gaps.reduce((a, g) => a + g, 0) / gaps.length) : 28;
}

/** «🌸 الدورة» in «تقدمي» (women only): one button that starts or ends it today, the day count, and when the next one is due. */
export function PeriodTracker({ clientId, periods, onChange }: { clientId: string; periods: PeriodLog[]; onChange: () => void }) {
  const today = todayKey();
  const cur = currentPeriod(periods, today);
  const [day, setDay] = useState(today);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setDay(today), [today]);

  async function start() {
    setBusy(true);
    const { error } = await supabase.from("period_logs").insert({ client_id: clientId, start_date: pick ? day : today });
    setBusy(false);
    if (error) return setErr(error.code === "42P01" ? "هالقسم يشتغل قريب." : "ما انحفظ. جربي مرة ثانية.");
    setErr(null);
    setPick(false);
    onChange();
  }
  async function end() {
    if (!cur) return;
    const d = pick ? day : today;
    setBusy(true);
    const { error } = await supabase.from("period_logs").update({ end_date: d < cur.start_date ? cur.start_date : d }).eq("id", cur.id);
    setBusy(false);
    if (error) return setErr("ما انحفظ. جربي مرة ثانية.");
    setErr(null);
    setPick(false);
    onChange();
  }
  async function remove(id: string) {
    await supabase.from("period_logs").delete().eq("id", id);
    onChange();
  }

  const last = [...periods].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
  const len = cycleLength(periods);
  const next = last ? addDays(last.start_date, len) : null;
  const left = next ? diffDays(today, next) : null;
  const dayN = cur ? diffDays(cur.start_date, today) + 1 : 0;

  return (
    <>
      <div className="sec-h"><h2>🌸 الدورة</h2></div>
      <section className="card stack period-card">
        {!cur && next ? <span className="period-next">الجاية تقريبا {shortDate(next)}</span> : null}
        {cur ? (
          <>
            <b className="period-day">اليوم {dayN}</b>
            <div className="period-bar" role="img" aria-label={`اليوم ${dayN} من الدورة`}>
              {Array.from({ length: 7 }, (_, i) => <i key={i} className={i < dayN ? "on" : ""} style={i < dayN ? { background: PINK } : undefined} />)}
            </div>
            <p className="small muted" style={{ margin: 0 }}>وزنك هالأيام ما ينحسب في تغير وزنك، لأن الانتفاخ واحتباس الماء طبيعي ومؤقت.</p>
          </>
        ) : left !== null ? (
          <b className="period-day">{left > 0 ? `باقي ${daysText(left)} تقريبا` : "ممكن تبدأ هالأيام"}</b>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>سجلي بداية ونهاية دورتك، ونفهم تغير وزنك صح ونطلع لك جدولك الخاص لو المدربة حطت لك واحد.</p>
        )}
        {pick ? (
          <div className="field">
            <label htmlFor="pd-day">{cur ? "يوم نهايتها" : "يوم بدايتها"}</label>
            <input id="pd-day" type="date" className="inp" value={day} max={today} min={cur?.start_date} onChange={(e) => setDay(e.target.value)} />
          </div>
        ) : null}
        {cur ? (
          <button type="button" className="btn btn-block" disabled={busy} onClick={end} style={{ background: PINK, color: "#fff" }}>خلصت الدورة</button>
        ) : (
          <button type="button" className="btn btn-block" disabled={busy} onClick={start} style={{ background: "transparent", color: PINK, border: `1.5px solid ${PINK}` }}>بدأت الدورة</button>
        )}
        {pick ? null : (
          <button type="button" className="link small" style={{ alignSelf: "center", minHeight: 0 }} onClick={() => setPick(true)}>مو اليوم؟ غيري التاريخ</button>
        )}
        {err ? <p className="alert err">{err}</p> : null}
        {periods.length ? (
          <details className="period-log">
            <summary>السجل ({periods.length})</summary>
            {periods.map((p) => (
              <div key={p.id} className="diary-row small">
                <span>{formatDate(p.start_date)} ← {p.end_date ? formatDate(p.end_date) : `${formatDate(periodEnd(p))} (تقريبا)`}</span>
                <button type="button" className="link small" style={{ minHeight: 0 }} onClick={() => remove(p.id)}>حذف</button>
              </div>
            ))}
          </details>
        ) : null}
      </section>
    </>
  );
}

/** Home note while she's on her period. */
export function PeriodNote({ clientId }: { clientId: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    supabase.from("period_logs").select("*").eq("client_id", clientId).order("start_date", { ascending: false }).limit(2)
      .then(({ data }) => setOn(Boolean(currentPeriod((data as PeriodLog[] | null) || []))));
  }, [clientId]);
  if (!on) return null;
  return (
    <div className="tip-card">
      <span className="em" aria-hidden="true">🌸</span>
      <span><b>أيام الدورة:</b> لو زاد وزنك أو حسيتي بانتفاخ هالأيام، هذا طبيعي ومؤقت (احتباس ماء) ويروح بعدها. كملي على خطتك 💛</span>
    </div>
  );
}
