"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FEELINGS, dayName, followupInfo } from "@/lib/followup";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Client, WeeklyFollowup } from "@/lib/types";

const WEEKS = [4, 8, 12, 16, 24];

/** Coach: turn follow-up on for a subscriber, set its length, extend or stop it; her check-ins. */
export function FollowupSettings({ client, wantsFollowup, onChange }: { client: Client; wantsFollowup: boolean; onChange: (c: Client) => void }) {
  const info = followupInfo(client);
  const [edit, setEdit] = useState(false);
  const [start, setStart] = useState(client.followup_start || todayKey());
  const [weeks, setWeeks] = useState(client.followup_weeks || 4);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<WeeklyFollowup[]>([]);

  useEffect(() => {
    supabase.from("weekly_followups").select("*").eq("client_id", client.id).order("week_date", { ascending: false }).then(({ data }) => setList((data as WeeklyFollowup[] | null) || []));
  }, [client.id]);

  async function save(patch: { followup_start: string | null; followup_weeks: number | null }) {
    setBusy(true);
    const { data, error } = await supabase.from("clients").update(patch).eq("id", client.id).select("*").single();
    setBusy(false);
    if (error || !data) return setErr(error?.code === "42703" ? "شغلي ملف phase7-weekly-followup.sql في Supabase أول." : "ما انحفظ. جربي مرة ثانية.");
    setErr(null);
    setEdit(false);
    onChange(data as Client);
  }

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">📅</span>
        <h2>المتابعة الأسبوعية</h2>
        {info.has && !edit ? <button type="button" className="aside link" onClick={() => setEdit(true)}>تعديل</button> : null}
      </div>
      <section className="card stack">
        {info.has && !edit ? (
          <>
            <div className="row between wrap">
              <span><span className="label" style={{ display: "block" }}>الأسبوع</span><b style={{ fontSize: 20, color: "var(--navy)" }}>{info.week} من {info.weeks}</b></span>
              <span style={{ textAlign: "end" }}><span className="label" style={{ display: "block" }}>{info.ended ? "انتهت" : `تنتهي (باقي ${info.daysLeft} يوم)`}</span><b>{formatDate(info.end)}</b></span>
            </div>
            <p className="small muted">بدأت {formatDate(info.start)} · متابعتها كل {dayName(info.start).split("،")[0]}</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn btn-s btn-sm" disabled={busy} onClick={() => save({ followup_start: info.start, followup_weeks: info.weeks + 4 })}>➕ مددي ٤ أسابيع</button>
              <button type="button" className="btn btn-g btn-sm" disabled={busy} onClick={() => save({ followup_start: info.start, followup_weeks: Math.max(1, Math.ceil((Date.now() - new Date(info.start + "T12:00:00").getTime()) / (7 * 864e5))) })}>⏹️ أنهي المتابعة اليوم</button>
            </div>
          </>
        ) : (
          <>
            {!info.has ? (
              <p className="small muted">
                {wantsFollowup ? "⚠️ اشتركت بالمتابعة. حددي متى تبدأ وكم أسبوع، وبيوصلها تذكير كل أسبوع تعبي متابعتها." : "فعّليها لو اشتركت بالمتابعة. بيوصلها تذكير كل أسبوع تعبي متابعتها."}
              </p>
            ) : null}
            <div className="grid2">
              <div className="field">
                <label htmlFor="fu-start">تبدأ من</label>
                <input id="fu-start" type="date" className="inp" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="fu-weeks">المدة</label>
                <select id="fu-weeks" className="inp" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                  {Array.from(new Set([...WEEKS, weeks])).sort((a, b) => a - b).map((w) => <option key={w} value={w}>{w} أسابيع{w % 4 === 0 ? ` (${w / 4 === 1 ? "شهر" : w / 4 === 2 ? "شهرين" : `${w / 4} شهور`})` : ""}</option>)}
                </select>
              </div>
            </div>
            <p className="note">أول متابعة لها بعد أسبوع من البداية ({dayName(new Date(new Date(start + "T12:00:00").getTime() + 7 * 864e5).toISOString().slice(0, 10))})، وبعدها كل أسبوع بنفس اليوم.</p>
            <div className="row" style={{ gap: 8 }}>
              {edit ? <button type="button" className="btn btn-g" onClick={() => setEdit(false)}>إلغاء</button> : null}
              <button type="button" className="btn btn-p" style={{ flex: 1 }} disabled={busy || !start} onClick={() => save({ followup_start: start, followup_weeks: weeks })}>{info.has ? "احفظي" : "✅ فعّلي المتابعة"}</button>
            </div>
            {info.has && edit ? (
              <button type="button" className="link" style={{ color: "var(--clay-ink)" }} disabled={busy} onClick={() => save({ followup_start: null, followup_weeks: null })}>شيلي المتابعة عنها</button>
            ) : null}
          </>
        )}
        {err ? <p className="alert err">{err}</p> : null}
        {list.length ? (
          <div className="stack" style={{ gap: 0, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
            {list.map((f) => (
              <Link key={f.id} href={`/coach/checkins/${f.id}`} className="diary-row">
                <span aria-hidden="true" style={{ fontSize: 20, flex: "none" }}>{f.feeling ? FEELINGS[f.feeling - 1] : "📅"}</span>
                <span>{dayName(f.week_date)}</span>
                <span className={`chip ${f.coach_notes ? "green" : "amber"}`} style={{ flex: "none" }}>{f.coach_notes ? "رديتي" : "تنتظر ردك"}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
