"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Brand, Loading } from "@/components/ui";
import { getGender, setGender, useGenderText } from "@/lib/gender";
import { ACTIVITY, CALC_GOALS, calcMacros, type CalcGoal, type CalcResult } from "@/lib/macros";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";

/** First screen after signup (everyone): a few questions, then the daily target is set. */
export default function StartPage() {
  const auth = useAuthGuard("client");
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [f, setF] = useState({ name: "", gender: "" as "" | "female" | "male", age: "", height: "", weight: "", act: 1.375, goal: "تخسيس" as CalcGoal });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CalcResult | null>(null);
  useGenderText(root, f.gender || getGender());

  useEffect(() => {
    if (auth.profile) setF((cur) => ({ ...cur, name: cur.name || auth.profile!.full_name || "", gender: cur.gender || auth.profile!.gender || "" }));
  }, [auth.profile]);

  if (auth.loading) return <Loading />;
  if (!auth.profile) return null;

  const num = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, ""));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const age = num(f.age), height = num(f.height), weight = num(f.weight);
    if (!f.gender) return setErr("اختاري الجنس.");
    if (!(age >= 12 && age <= 90)) return setErr("اكتبي عمرك.");
    if (!(height >= 120 && height <= 230)) return setErr("اكتبي طولك بالسنتيمتر.");
    if (!(weight >= 30 && weight <= 300)) return setErr("اكتبي وزنك بالكيلو.");
    setBusy(true);
    setErr(null);
    const { data: cid, error } = await supabase.rpc("save_onboarding", { p_name: f.name.trim(), p_gender: f.gender, p_age: age, p_height: height, p_weight: weight, p_activity: f.act, p_goal: f.goal });
    if (error || !cid) {
      setBusy(false);
      return setErr("ما انحفظت. تأكدي من الاتصال وجربي مرة ثانية.");
    }
    const t = calcMacros({ gender: f.gender, age, weight, height, act: f.act, goal: f.goal })!;
    await supabase.from("food_targets").upsert({ client_id: cid, cal: t.cal, p: t.p, c: t.c, f: t.f }, { onConflict: "client_id" });
    setGender(f.gender);
    setBusy(false);
    setDone(t);
  }

  return (
    <div className="app" ref={root}>
      <div className="safe-top" aria-hidden="true" />
      <main className="screen gutter" style={{ paddingTop: 24, paddingBottom: 40 }}>
        <Brand />
        {done ? (
          <section className="cal-hero" style={{ marginTop: 16 }}>
            <h2>🎯 هدفك اليومي جاهز</h2>
            <p>حسبناه بنفس معادلة المدربة زهراء على حسب معلوماتك.</p>
            <div style={{ textAlign: "center", padding: "6px 0" }}>
              <b className="num" style={{ fontSize: 48 }}>{done.cal}</b>
              <div style={{ color: "rgba(255,255,255,.8)" }}>سعرة في اليوم</div>
            </div>
            <div className="cal-macros">
              {([["💪 بروتين", done.p], ["🌾 كارب", done.c], ["🫒 دهون", done.f]] as [string, number][]).map(([l, v]) => (
                <div key={l}><span>{l}</span><b>{v}g</b></div>
              ))}
            </div>
            <p style={{ marginTop: 6 }}>🎯 {done.note}</p>
            <button type="button" className="btn btn-p btn-block" onClick={() => router.replace("/app")}>يلا نبدأ 💪</button>
          </section>
        ) : (
          <form className="stack" onSubmit={submit} style={{ marginTop: 16 }}>
            <div>
              <h1 style={{ fontSize: 24 }}>أهلًا فيك 👋</h1>
              <p className="small muted">جاوبي على كم سؤال ونحسب لك سعراتك وماكروزك من أول يوم.</p>
            </div>
            <section className="card stack">
              <div className="field">
                <label htmlFor="st-name">اسمك</label>
                <input id="st-name" className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
              </div>
              <div className="field">
                <span className="label">الجنس</span>
                <div className="seg-tabs" role="radiogroup" aria-label="الجنس">
                  {([["female", "👩 أنثى"], ["male", "👨 ذكر"]] as const).map(([g, l]) => (
                    <button key={g} type="button" role="radio" aria-checked={f.gender === g} aria-selected={f.gender === g} onClick={() => { setGender(g); setF({ ...f, gender: g }); }}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid3">
                {([["age", "العمر"], ["height", "الطول (سم)"], ["weight", "الوزن (كجم)"]] as const).map(([k, l]) => (
                  <div key={k} className="field">
                    <label htmlFor={`st-${k}`}>{l}</label>
                    <input id={`st-${k}`} className="inp num" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="field">
                <label htmlFor="st-act">🏃‍♀️ نشاطك</label>
                <select id="st-act" className="inp" value={f.act} onChange={(e) => setF({ ...f, act: Number(e.target.value) })}>
                  {ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <span className="label">🎯 هدفك</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {CALC_GOALS.map(([v, l]) => (
                    <button key={v} type="button" className="opt" aria-pressed={f.goal === v} onClick={() => setF({ ...f, goal: v })} style={{ padding: "10px 12px" }}>
                      <span className="opt-t" style={{ fontSize: 14 }}>{l}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            {err ? <p className="alert err">{err}</p> : null}
            <button className="btn btn-p btn-block" type="submit" disabled={busy}>{busy ? "لحظة..." : "احسبي هدفي"}</button>
          </form>
        )}
      </main>
    </div>
  );
}
