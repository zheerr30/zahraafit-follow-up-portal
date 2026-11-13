"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push";
import { supabase } from "@/lib/supabase";

type Prefs = { meal_times: string[]; water: boolean; workout_time: string | null; saturday?: boolean; day_summary?: boolean; day_summary_time?: string };

/** 6 pm to 11:30 pm, every half hour (Riyadh time). */
const SUMMARY_TIMES = Array.from({ length: 12 }, (_, i) => `${String(18 + Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);
const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "مساء" : "صباحا"}`;
};

const DEFAULT_TIMES: Record<number, string[]> = {
  1: ["14:00"],
  2: ["13:00", "20:00"],
  3: ["09:00", "14:00", "20:00"],
  4: ["09:00", "13:00", "17:00", "21:00"],
  5: ["09:00", "12:00", "15:00", "18:00", "21:00"]
};

/** Phone reminders: turn on for this phone, pick meal times, water, workout. */
export function Reminders({ profileId, mealsPerDay, subscriber = true }: { profileId: string; mealsPerDay: number; subscriber?: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState);
    supabase.from("reminder_prefs").select("*").eq("profile_id", profileId).maybeSingle().then(({ data }) => {
      // Few by default: the main meals only, no water reminders.
      setPrefs((data as Prefs | null) || { meal_times: DEFAULT_TIMES[Math.min(3, Math.max(1, mealsPerDay || 3))], water: false, workout_time: null, saturday: true });
    });
  }, [profileId, mealsPerDay]);

  async function save(next: Prefs, msg = "انحفظت أوقاتك") {
    setPrefs(next);
    const clean: Prefs = { ...next, meal_times: Array.from(new Set(next.meal_times.filter(Boolean))).sort() };
    if (clean.saturday === undefined) delete clean.saturday;
    if (clean.day_summary === undefined) delete clean.day_summary;
    if (clean.day_summary_time === undefined) delete clean.day_summary_time;
    const { error } = await supabase.from("reminder_prefs").upsert({ profile_id: profileId, ...clean }, { onConflict: "profile_id" });
    toast.show(error ? "ما انحفظ. تأكدي من الاتصال." : msg);
  }

  async function on() {
    setBusy(true);
    setErr(null);
    try {
      const e = await turnOnPush(profileId);
      if (e) setErr(e);
      else {
        await save(prefs!, "🔔 تم، التذكيرات شغالة على جوالك");
        setState("on");
      }
    } catch {
      setErr("ما قدرنا نشغل التذكيرات على هالجوال. جربي مرة ثانية.");
    }
    setBusy(false);
  }

  if (!state || !prefs) return null;

  return (
    <section id="reminders" className="card stack">
      {state === "on" ? <span className="chip green" style={{ alignSelf: "flex-start" }}>🔔 شغالة على هالجوال</span> : null}

      {state === "install" ? (
        <div className="small stack" style={{ gap: 6 }}>
          <p>عشان توصلك التذكيرات على الآيفون، أضيفي التطبيق لشاشتك الرئيسية أول:</p>
          <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
            <li>افتحي الموقع من <b>Safari</b></li>
            <li>اضغطي زر المشاركة <span aria-hidden="true">⬆️</span> تحت</li>
            <li>اختاري <b>«إضافة إلى الشاشة الرئيسية»</b></li>
            <li>افتحي ZahraaFit من الأيقونة وارجعي لهالصفحة</li>
          </ol>
        </div>
      ) : state === "unsupported" ? (
        <p className="small muted">هالمتصفح ما يدعم الإشعارات. جربي من Chrome أو Safari على جوالك.</p>
      ) : state === "denied" ? (
        <p className="small muted">الإشعارات مقفلة لهالموقع. افتحي إعدادات الجوال ← الإشعارات ← ZahraaFit وفعليها، وبعدين ارجعي هنا.</p>
      ) : state === "off" ? (
        <>
          <p className="small muted">نذكرك بوقت وجباتك، وبشرب الماء، وبتمرينك. تختارين الأوقات اللي تناسبك.</p>
          <button type="button" className="btn btn-p btn-block" onClick={on} disabled={busy}>{busy ? "لحظة..." : "🔔 شغلي التذكيرات"}</button>
        </>
      ) : null}
      {err ? <p className="alert err">{err}</p> : null}

      <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <label className="row between" style={{ cursor: "pointer" }}>
          <span>ملخص نهاية اليوم <span className="note">(وش سويتي اليوم، ونصيحة لبكرا)</span></span>
          <input type="checkbox" checked={prefs.day_summary !== false} onChange={() => save({ ...prefs, day_summary: prefs.day_summary === false, day_summary_time: prefs.day_summary_time || "21:00" })} style={{ width: 22, height: 22, accentColor: "var(--clay)" }} />
        </label>
        {prefs.day_summary !== false ? (
          <div className="row between">
            <span>وقت الملخص</span>
            <select className="inp num" aria-label="وقت ملخص نهاية اليوم" value={prefs.day_summary_time || "21:00"} style={{ width: 150, minHeight: 40 }}
              onChange={(e) => save({ ...prefs, day_summary: true, day_summary_time: e.target.value })}>
              {SUMMARY_TIMES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
            </select>
          </div>
        ) : null}
        {state !== "on" && prefs.day_summary !== false ? <p className="note">يطلع لك الملخص في الرئيسية. ولو تبينه يوصلك إشعار، شغلي التذكيرات فوق.</p> : null}
      </div>

      {state === "on" ? (
        <>
          <div className="field">
            <span className="label">🍽️ أوقات الوجبات</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {prefs.meal_times.map((t, i) => (
                <span key={i} className="row" style={{ gap: 2, background: "var(--sunken)", borderRadius: 10, padding: "2px 4px 2px 8px" }}>
                  <input type="time" className="inp num" aria-label={`وقت الوجبة ${i + 1}`} value={t} style={{ border: 0, background: "transparent", minHeight: 38, width: 104, padding: 0 }}
                    onChange={(e) => setPrefs({ ...prefs, meal_times: prefs.meal_times.map((x, j) => (j === i ? e.target.value : x)) })}
                    onBlur={() => save(prefs)} />
                  <button type="button" className="icon-btn" aria-label="احذفي الوقت" onClick={() => save({ ...prefs, meal_times: prefs.meal_times.filter((_, j) => j !== i) })}><X size={15} /></button>
                </span>
              ))}
              {prefs.meal_times.length < 8 ? (
                <button type="button" className="btn btn-g btn-sm" onClick={() => setPrefs({ ...prefs, meal_times: [...prefs.meal_times, "16:00"] })}><Plus size={15} />وقت</button>
              ) : null}
            </div>
          </div>
          <label className="row between" style={{ cursor: "pointer" }}>
            <span>💧 ذكريني بالماء كل ساعتين <span className="note">(١٠ الصبح لـ ١٠ الليل)</span></span>
            <input type="checkbox" checked={prefs.water} onChange={() => save({ ...prefs, water: !prefs.water })} style={{ width: 22, height: 22, accentColor: "var(--clay)" }} />
          </label>
          {subscriber ? (
            <label className="row between" style={{ cursor: "pointer" }}>
              <span>📅 ذكريني بتسجيل السبت <span className="note">(١٠ الصبح)</span></span>
              <input type="checkbox" checked={prefs.saturday !== false} onChange={() => save({ ...prefs, saturday: prefs.saturday === false })} style={{ width: 22, height: 22, accentColor: "var(--clay)" }} />
            </label>
          ) : null}
          <div className="row between">
            <span>💪 وقت التمرين</span>
            <span className="row" style={{ gap: 6 }}>
              <input type="time" className="inp num" aria-label="وقت التمرين" value={prefs.workout_time || ""} style={{ width: 120, minHeight: 40 }}
                onChange={(e) => setPrefs({ ...prefs, workout_time: e.target.value || null })} onBlur={() => save(prefs)} />
              {prefs.workout_time ? <button type="button" className="icon-btn" aria-label="بدون تذكير تمرين" onClick={() => save({ ...prefs, workout_time: null })}><X size={15} /></button> : null}
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-s" style={{ flex: 1 }} onClick={async () => {
              const { data } = await supabase.rpc("push_test");
              toast.show(data ? "بيوصلك تنبيه تجربة خلال ثواني" : "جربتي قبل شوي، انتظري دقيقة");
            }}>جربي تنبيه</button>
            <button type="button" className="btn btn-g" onClick={async () => { await turnOffPush(); setState("off"); toast.show("وقفنا التذكيرات على هالجوال"); }}>إيقاف</button>
          </div>
        </>
      ) : null}
      {toast.node}
    </section>
  );
}
