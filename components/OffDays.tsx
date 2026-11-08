"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/followup";
import { WEEKDAYS, cancelOff, loadOff, setOff, usedInWeek, weekStart, type OffInfo } from "@/lib/off-days";
import { todayKey } from "@/lib/plan-data";

/** «حسابي»: pick or cancel off days, within the weekly limit. */
export function OffDays({ clientId }: { clientId: string }) {
  const today = todayKey();
  const [info, setInfo] = useState<OffInfo | null>(null);
  const [day, setDay] = useState(today);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadOff(clientId, today).then(setInfo);
  }, [clientId, today]);
  if (!info) return null;

  const upcoming = Array.from(info.days).filter((d) => d >= today).sort();
  const left = Math.max(0, info.limit - usedInWeek(info, day));
  async function pick() {
    setBusy(true);
    const err = await setOff(day);
    setBusy(false);
    if (err) return setMsg({ ok: false, t: err });
    setInfo(await loadOff(clientId, today));
    setMsg({ ok: true, t: `صار ${day === today ? "اليوم" : formatDate(day)} يوم أوف 😌` });
  }

  return (
    <section className="card stack">
      <b>😌 أيام الأوف</b>
      <p className="note" style={{ margin: 0 }}>
        يوم ما تحسبين فيه سعرات. أكلك ينحفظ لو سجلتيه، بس ما يدخل في متوسطك ولا ملخصك، وسلسلتك ما تنكسر.
        {" "}{info.limit ? `لك ${info.limit === 1 ? "يوم واحد" : info.limit === 2 ? "يومين" : `${info.limit} أيام`} كل أسبوع (من السبت للجمعة).` : "المدربة ما حطت لك أيام أوف حاليا."}
      </p>
      {info.weekday !== null ? <p className="small" style={{ margin: 0 }}>📌 يوم {WEEKDAYS[info.weekday]} يوم حر في خطتك من المدربة، ويتحسب أوف لحاله.</p> : null}
      {upcoming.length ? (
        <div>
          {upcoming.map((d) => (
            <div key={d} className="diary-row">
              <span>{d === today ? "اليوم" : formatDate(d)}</span>
              {d > today ? (
                <button type="button" className="link small" style={{ minHeight: 0 }} onClick={async () => {
                  const err = await cancelOff(d);
                  if (err) return setMsg({ ok: false, t: err });
                  setInfo(await loadOff(clientId, today));
                  setMsg({ ok: true, t: "انلغى يوم الأوف" });
                }}>إلغاء</button>
              ) : <span className="note">بدأ</span>}
            </div>
          ))}
        </div>
      ) : null}
      {info.limit ? (
        <>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="off-day">اليوم</label>
              <input id="off-day" type="date" className="inp" value={day} min={today} max={addDays(today, 30)} onChange={(e) => { setDay(e.target.value); setMsg(null); }} />
            </div>
            <button type="button" className="btn btn-s" disabled={busy || !left} onClick={pick}>حددي يوم أوف</button>
          </div>
          <span className="note">{left ? `باقي لك ${left} في أسبوع ${formatDate(weekStart(day))}` : "خلصتي أيام الأوف لهالأسبوع"}</span>
        </>
      ) : null}
      {msg ? <p className={`alert ${msg.ok ? "info" : "err"}`} role="status">{msg.t}</p> : null}
    </section>
  );
}
