"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PUSH_MAX, TEMPLATE_KEYS, mergeTemplates, type TemplateKey, type Templates } from "@/lib/day-summary";

/** «المتابعات»: the ready sentences of the end-of-day summary for free accounts. */
export function DaySummaryTemplates() {
  const [t, setT] = useState<Templates | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "day_summary_templates").maybeSingle().then(({ data, error }) => {
      if (!error) setT(mergeTemplates(data?.value));
    });
  }, []);

  async function save() {
    if (!t) return;
    const long = TEMPLATE_KEYS.find(({ key }) => t[key].plain.length > PUSH_MAX);
    if (long) return setMsg(`جملة «${long.label}» بدون أرقام أطول من ${PUSH_MAX} حرف، قصريها`);
    const { error } = await supabase.from("app_settings").upsert({ key: "day_summary_templates", value: t, updated_at: new Date().toISOString() });
    setMsg(error ? "ما انحفظ، جربي مرة ثانية" : "انحفظت ✅");
  }

  if (!t) return null;
  const set = (k: TemplateKey, f: "push" | "plain" | "rec", v: string) => setT({ ...t, [k]: { ...t[k], [f]: v } });

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">🌙</span>
        <h2>ملخص نهاية اليوم</h2>
      </div>
      <section className="card stack">
        <p className="small muted">
          كل ليلة (الساعة ٩ أو الوقت اللي تختاره المشتركة) يوصلها إشعار بجملة وحدة عن يومها، ويفتح لها «ملخص يومك» في الرئيسية.
          المشتركات تنكتب لهم الجملة بالذكاء الاصطناعي من أرقامهم. الحسابات المجانية تطلع لهم جملك هنا.
        </p>
        <p className="note">
          الأرقام تنحط مكان: {"{p}"} البروتين، {"{p_goal}"} هدف البروتين، {"{cal}"} السعرات، {"{cal_goal}"} هدف السعرات، {"{water}"} الأكواب، {"{water_goal}"} هدف الأكواب، {"{meals_left}"} الوجبات اللي فاتتها.
          اكتبيها بصيغة المؤنث وتتحول للمذكر لحالها. بدون إيموجي وبدون علامة تعجب.
        </p>
        <button type="button" className="btn btn-s" onClick={() => setOpen(!open)}>{open ? "إخفاء الجمل" : "عدلي الجمل"}</button>
      </section>
      {open ? (
        <>
          {TEMPLATE_KEYS.map(({ key, label }) => (
            <section key={key} className="card stack">
              <b>{label}</b>
              <label className="field">
                <span className="label">الإشعار (مع أرقام)</span>
                <textarea className="inp" rows={2} value={t[key].push} onChange={(e) => set(key, "push", e.target.value)} />
              </label>
              <label className="field">
                <span className="label">الإشعار بدون أرقام <span className="note">(لمن اختارت تخفي الأرقام · {t[key].plain.length} من {PUSH_MAX})</span></span>
                <textarea className="inp" rows={2} value={t[key].plain} onChange={(e) => set(key, "plain", e.target.value)} />
              </label>
              {key !== "excellent" && key !== "nolog" ? (
                <label className="field">
                  <span className="label">التوصية لبكرا (تطلع في الكرت)</span>
                  <textarea className="inp" rows={2} value={t[key].rec} onChange={(e) => set(key, "rec", e.target.value)} />
                </label>
              ) : null}
            </section>
          ))}
          <section className="card stack">
            <button type="button" className="btn btn-p btn-block" onClick={save}>احفظي الجمل</button>
            {msg ? <p className="note" role="status">{msg}</p> : null}
          </section>
        </>
      ) : msg ? <p className="note" role="status">{msg}</p> : null}
    </>
  );
}
