"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { currentPeriod, periodEnd, type PeriodLog } from "@/lib/period";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

/** «🌸 الدورة» in «تقدمي» (women only): start and end, and the last few. */
export function PeriodTracker({ clientId, periods, onChange }: { clientId: string; periods: PeriodLog[]; onChange: () => void }) {
  const today = todayKey();
  const cur = currentPeriod(periods, today);
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setDay(today), [today]);

  async function start() {
    setBusy(true);
    const { error } = await supabase.from("period_logs").insert({ client_id: clientId, start_date: day });
    setBusy(false);
    if (error) return setErr(error.code === "42P01" ? "هالقسم يشتغل قريب." : "ما انحفظ. جربي مرة ثانية.");
    setErr(null);
    onChange();
  }
  async function end() {
    if (!cur) return;
    setBusy(true);
    const { error } = await supabase.from("period_logs").update({ end_date: day < cur.start_date ? cur.start_date : day }).eq("id", cur.id);
    setBusy(false);
    if (error) return setErr("ما انحفظ. جربي مرة ثانية.");
    setErr(null);
    onChange();
  }
  async function remove(id: string) {
    await supabase.from("period_logs").delete().eq("id", id);
    onChange();
  }

  return (
    <>
      <div className="sec-h"><h2>🌸 الدورة</h2></div>
      <section className="card stack">
        {cur ? (
          <p className="small">🌸 دورتك بدأت <b>{formatDate(cur.start_date)}</b>. وزن هالأيام ما نحسبه في تغير وزنك، لأن الانتفاخ واحتباس الماء طبيعي ومؤقت.</p>
        ) : (
          <p className="small muted">سجلي بداية ونهاية دورتك، ونفهم تغير وزنك صح ونطلع لك جدولك الخاص لو المدربة حطت لك واحد.</p>
        )}
        <div className="field">
          <label htmlFor="pd-day">{cur ? "يوم نهايتها" : "يوم بدايتها"}</label>
          <input id="pd-day" type="date" className="inp" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
        </div>
        {cur ? (
          <button type="button" className="btn btn-s btn-block" disabled={busy} onClick={end}>خلصت الدورة</button>
        ) : (
          <button type="button" className="btn btn-p btn-block" disabled={busy} onClick={start}>🌸 بدأت الدورة</button>
        )}
        {err ? <p className="alert err">{err}</p> : null}
        {periods.length ? (
          <div className="stack" style={{ gap: 0 }}>
            {periods.slice(0, 4).map((p) => (
              <div key={p.id} className="diary-row small">
                <span>{formatDate(p.start_date)} ← {p.end_date ? formatDate(p.end_date) : `${formatDate(periodEnd(p))} (تقريبا)`}</span>
                <button type="button" className="link small" style={{ minHeight: 0 }} onClick={() => remove(p.id)}>حذف</button>
              </div>
            ))}
          </div>
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
