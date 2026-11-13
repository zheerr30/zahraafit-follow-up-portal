"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import { useEffect, useState } from "react";
import { ACTIVITY, CALC_GOALS, calcMacros, type CalcGoal } from "@/lib/macros";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui";
import type { IntakeAnswers } from "@/lib/intake";

type Form = { gender: "female" | "male"; age: string; weight: string; height: string; act: number; goal: CalcGoal };

const GOAL_FROM_INTAKE: Record<string, CalcGoal> = { lose: "تخسيس", muscle: "تضخيم", shape: "ريكومب" };

/** Calorie and macro calculator, same rules as the coach's generator. */
export function Calculator({ profileId }: { profileId: string }) {
  const toast = useToast();
  const [f, setF] = useState<Form>({ gender: "female", age: "", weight: "", height: "", act: 1.375, goal: "تخسيس" });

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: b }] = await Promise.all([
        supabase.from("plan_requests").select("answers").eq("profile_id", profileId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("body_logs").select("weight_kg").not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle()
      ]);
      const a = (r?.answers || null) as Partial<IntakeAnswers> | null;
      if (!a && !b) return;
      setF((cur) => ({
        ...cur,
        gender: a?.gender || cur.gender,
        age: a?.age ? String(a.age) : cur.age,
        height: a?.height_cm ? String(a.height_cm) : cur.height,
        weight: b?.weight_kg ? String(b.weight_kg) : a?.weight_kg ? String(a.weight_kg) : cur.weight,
        goal: (a?.goal && GOAL_FROM_INTAKE[a.goal]) || cur.goal
      }));
    })();
  }, [profileId]);

  const res = calcMacros({ gender: f.gender, age: Number(f.age), weight: Number(f.weight), height: Number(f.height), act: f.act, goal: f.goal });
  const num = (k: "age" | "weight" | "height", label: string, ph: string) => (
    <div className="field">
      <label htmlFor={`c-${k}`}>{label}</label>
      <input id={`c-${k}`} className="inp num" inputMode="decimal" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
    </div>
  );

  return (
    <>
      <div className="tip-card">
        <span className="em" aria-hidden="true">🧮</span>
        <span>احسبي سعراتك وماكروزك بنفس طريقة المدربة. عبينا معلوماتك من طلبك وآخر وزن سجلتيه، وتقدرين تغيرينها.</span>
      </div>
      <section className="card stack">
        <div className="grid3">
          {num("age", "العمر", "30")}
          {num("weight", "الوزن (كجم)", "70")}
          {num("height", "الطول (سم)", "160")}
        </div>
        <div className="field">
          <label htmlFor="c-act">🏃‍♀️ نشاطك</label>
          <select id="c-act" className="inp" value={f.act} onChange={(e) => setF({ ...f, act: Number(e.target.value) })}>
            {ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">🎯 هدفك</span>
          <div className="opts" style={{ gridTemplateColumns: "1fr 1fr", display: "grid", gap: 8 }}>
            {CALC_GOALS.map(([v, l]) => (
              <button key={v} type="button" className="opt" aria-pressed={f.goal === v} onClick={() => setF({ ...f, goal: v })} style={{ padding: "10px 12px" }}>
                <span className="opt-t" style={{ fontSize: 14 }}>{l}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {res ? (
        <section className="card stack" style={{ gap: 12 }}>
          <div>
            <span className="label">🔥 سعراتك في اليوم</span>
            <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
              <b className="num" style={{ fontSize: 36, lineHeight: 1.1, color: "var(--navy)" }}>{res.cal}</b>
              <span className="muted small">سعرة · احتياجك للثبات {res.tdee}</span>
            </div>
          </div>
          <div className="grid3">
            {([["p", res.p, "var(--protein)"], ["c", res.c, "var(--carb)"], ["f", res.f, "var(--fat)"]] as ["p" | "c" | "f", number, string][]).map(([l, v, c]) => (
              <div key={l} className="mtile" style={{ "--c": c, textAlign: "start" } as React.CSSProperties}>
                <span><MacLabel k={l} /></span>
                <b>{v} غ</b>
              </div>
            ))}
          </div>
          <p className="small">🌿 ألياف {res.fiber} غ · 🎯 {res.note}</p>
          <p className="note">أرقام تقريبية تساعدك تتابعين نفسك. لو عندك خطة من المدربة، خطتك هي المعتمدة.</p>
          <button type="button" className="btn btn-s" onClick={async () => {
            const { data: c } = await supabase.from("clients").select("id").eq("profile_id", profileId).maybeSingle();
            if (!c) return toast.show("ما قدرنا نحفظ. جربي مرة ثانية.");
            const { error } = await supabase.from("food_targets").upsert({ client_id: c.id, cal: res.cal, p: res.p, c: res.c, f: res.f }, { onConflict: "client_id" });
            toast.show(error ? "ما انحفظ. تأكدي من الاتصال." : "🎯 صار هدفك في «سعراتي»");
          }}>🎯 احفظيها هدفي اليومي</button>
        </section>
      ) : (
        <p className="alert info">عبي العمر والوزن والطول وتطلع لك الأرقام.</p>
      )}
      {toast.node}
    </>
  );
}
