"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { CoachShell, Loading, useToast } from "@/components/ui";
import type { Meal, MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Plan } from "@/lib/types";

type Sheet = { type: "swap" | "size" | "note"; d: number; m: number } | null;
const SIZES = [0.75, 0.9, 1.1, 1.25, 1.5];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Same meal, amounts and macros multiplied (text amounts like «حسب الذوق» stay). */
function scaleMeal(meal: Meal, k: number): Meal {
  return {
    ...meal,
    cal: Math.round(meal.cal * k),
    p: r1(meal.p * k),
    c: r1(meal.c * k),
    f: r1(meal.f * k),
    ingredients: meal.ingredients.map((i) => (typeof i.a === "number" && i.a > 0 ? { ...i, a: i.u === "g" || i.u === "غ" || i.u === "جم" || i.u === "مل" ? Math.round(i.a * k) : r1(i.a * k) } : i))
  };
}

/** Coach: change a subscriber's plan without regenerating it. */
export default function PlanEditor() {
  const auth = useAuthGuard("admin");
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [row, setRow] = useState<Plan | null>(null);
  const [plan, setPlan] = useState<MealPlanData | null>(null);
  const [name, setName] = useState("");
  const [day, setDay] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [custom, setCustom] = useState("");
  const [noteText, setNoteText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.profile || !params?.id) return;
    (async () => {
      const { data } = await supabase.from("plans").select("*").eq("id", params.id).maybeSingle();
      const p = data as Plan | null;
      if (p?.data && (p.data as MealPlanData).format === "zahraafit-meal-plan") {
        setRow(p);
        setPlan(JSON.parse(JSON.stringify(p.data)) as MealPlanData);
        const { data: c } = await supabase.from("clients").select("id, profile_id").eq("id", p.client_id).maybeSingle();
        if (c) {
          const { data: pr } = await supabase.from("profiles").select("full_name").eq("id", c.profile_id).maybeSingle();
          setName(pr?.full_name || "");
        }
      }
      setLoading(false);
    })();
  }, [auth.profile, params?.id]);

  const options = useMemo(() => {
    if (!plan) return [] as { meal: Meal; where: string }[];
    const seen = new Set<string>();
    const out: { meal: Meal; where: string }[] = [];
    plan.days.forEach((d) => d.meals.forEach((m) => { if (!seen.has(m.name)) { seen.add(m.name); out.push({ meal: m, where: `اليوم ${d.n} · ${m.slot}` }); } }));
    plan.extras.snacks.forEach((m) => { if (!seen.has(m.name)) { seen.add(m.name); out.push({ meal: { ...m, slot: m.slot || "سناك" }, where: "سناك إضافي" }); } });
    plan.extras.salads.forEach((m) => { if (!seen.has(m.name)) { seen.add(m.name); out.push({ meal: { ...m, slot: m.slot || "سلطة" }, where: "سلطة إضافية" }); } });
    return out;
  }, [plan]);

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;
  if (!plan || !row) return <CoachShell><p className="alert err">هذي الخطة ما تنعدل هنا (لازم تكون مرسلة من المولد داخل المنصة).</p></CoachShell>;

  function setMeal(d: number, m: number, meal: Meal) {
    const next = { ...plan!, days: plan!.days.map((x, i) => (i === d ? { ...x, meals: x.meals.map((y, j) => (j === m ? meal : y)) } : x)) };
    setPlan(next);
    setDirty(true);
    setSheet(null);
  }

  async function save() {
    setBusy(true);
    const data = { ...plan!, editedAt: new Date().toISOString() };
    const { error } = await supabase.from("plans").update({ data }).eq("id", row!.id);
    setBusy(false);
    if (error) return toast.show("ما انحفظت. جربي مرة ثانية.");
    setDirty(false);
    toast.show("✅ انحفظت. تشوفها المشتركة على طول في «أكلي»");
  }

  const meals = plan.days[day].meals;
  const total = meals.reduce((t, x) => ({ cal: t.cal + x.cal, p: t.p + x.p, c: t.c + x.c, f: t.f + x.f }), { cal: 0, p: 0, c: 0, f: 0 });
  const cur = sheet ? plan.days[sheet.d].meals[sheet.m] : null;

  return (
    <CoachShell>
      <Link className="link" href={`/coach/subscribers/${row.client_id}`}><ChevronRight />{name || "المشتركة"}</Link>
      <div className="row between wrap">
        <div>
          <h1 style={{ fontSize: 22 }}>✏️ تعديل خطتها الغذائية</h1>
          <p className="small muted">بدلي وجبة، أو كبري وصغري الكمية، أو اكتبي ملاحظة. التعديل يوصلها على طول بدون ما تولدين جدول جديد.</p>
        </div>
      </div>

      <section className="card stack">
        <label htmlFor="coach-note"><b>💬 رسالة لها تطلع فوق في «أكلي»</b></label>
        <textarea id="coach-note" className="inp" rows={2} value={plan.coachNote || ""} onChange={(e) => { setPlan({ ...plan, coachNote: e.target.value }); setDirty(true); }} placeholder="مثلًا: بدلت لك الفطور بوجبة أسرع زي ما طلبتي 💪" />
      </section>

      <div className="days" role="group" aria-label="أيام الخطة">
        {plan.days.map((d, i) => (
          <button key={i} type="button" className="day-pill" aria-pressed={i === day} onClick={() => setDay(i)}>
            <span>اليوم</span>
            <b className="num">{d.n}</b>
          </button>
        ))}
      </div>

      <section className="card row between wrap">
        <span><b className="num" style={{ fontSize: 22, color: "var(--navy)" }}>{Math.round(total.cal)}</b> <span className="small muted">من {plan.target.cal} سعرة</span></span>
        <span className="small"><MacLine p={`${Math.round(total.p)} / ${plan.target.p}`} c={`${Math.round(total.c)} / ${plan.target.c}`} f={`${Math.round(total.f)} / ${plan.target.f}`} /></span>
      </section>

      {meals.map((meal, m) => (
        <section key={m} className="card stack" style={{ gap: 8 }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <span className="small muted">{meal.slot}</span>
              <b style={{ display: "block", color: "var(--navy)" }}>{meal.name}</b>
            </div>
            <span className="chip">{meal.cal} سعرة</span>
          </div>
          <p className="small muted"><MacLine p={Math.round(meal.p)} c={Math.round(meal.c)} f={Math.round(meal.f)} /> — {meal.ingredients.map((i) => `${i.n} ${typeof i.a === "number" && i.a ? `${i.a}${i.u}` : ""}`).join("، ")}</p>
          {meal.note ? <p className="note">📝 {meal.note}</p> : null}
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setSheet({ type: "swap", d: day, m })}>🔁 بدليها</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => { setCustom(""); setSheet({ type: "size", d: day, m }); }}>⚖️ الكمية</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => { setNoteText(meal.note || ""); setSheet({ type: "note", d: day, m }); }}>📝 ملاحظة</button>
          </div>
        </section>
      ))}

      <div className="save-bar">
        <button type="button" className="btn btn-p btn-block" disabled={!dirty || busy} onClick={save}>{busy ? "لحظة..." : dirty ? "💾 احفظي التعديلات" : "ما فيه تعديلات"}</button>
      </div>

      {sheet && cur ? (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="تعديل الوجبة" style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div className="row between">
              <h2 style={{ fontSize: 17 }}>{sheet.type === "swap" ? `بدلي «${cur.name}»` : sheet.type === "size" ? "كبري أو صغري الكمية" : "ملاحظة على الوجبة"}</h2>
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setSheet(null)}><X /></button>
            </div>
            {sheet.type === "swap" ? (
              <div className="opts">
                {[...options].sort((a, b) => Number(b.meal.slot === cur.slot) - Number(a.meal.slot === cur.slot)).filter((o) => o.meal.name !== cur.name).map((o) => (
                  <button key={o.meal.name} type="button" className="opt" onClick={() => setMeal(sheet.d, sheet.m, { ...JSON.parse(JSON.stringify(o.meal)), slot: cur.slot })}>
                    <span style={{ minWidth: 0 }}>
                      <span className="opt-t">{o.meal.name}</span>
                      <span className="opt-s">{o.where} · {o.meal.cal} سعرة · <MacLine p={Math.round(o.meal.p)} c={Math.round(o.meal.c)} f={Math.round(o.meal.f)} /></span>
                    </span>
                  </button>
                ))}
              </div>
            ) : sheet.type === "size" ? (
              <div className="stack">
                <p className="small muted">كل المكونات والسعرات تتغير بنفس النسبة. الحين: {cur.cal} سعرة.</p>
                <div className="row wrap" style={{ gap: 8 }}>
                  {SIZES.map((k) => (
                    <button key={k} type="button" className="btn btn-s btn-sm" onClick={() => setMeal(sheet.d, sheet.m, scaleMeal(cur, k))}>
                      {k < 1 ? "أقل" : "أكثر"} {Math.round(Math.abs(k - 1) * 100)}٪ · {Math.round(cur.cal * k)} سعرة
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="cal-target">أو حطي السعرات اللي تبينها</label>
                    <input id="cal-target" className="inp num" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} placeholder={String(cur.cal)} />
                  </div>
                  <button type="button" className="btn btn-p" disabled={!Number(custom) || !cur.cal} onClick={() => setMeal(sheet.d, sheet.m, scaleMeal(cur, Number(custom) / cur.cal))}>طبقي</button>
                </div>
                <p className="note">كميات البدائل داخل الوجبة ما تتغير، راجعيها لو تحتاج.</p>
              </div>
            ) : (
              <div className="stack">
                <textarea className="inp" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} aria-label="الملاحظة" placeholder="مثلًا: تقدرين تحضرينها من الليل" />
                <button type="button" className="btn btn-p" onClick={() => setMeal(sheet.d, sheet.m, { ...cur, note: noteText.trim() })}>تم</button>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {toast.node}
    </CoachShell>
  );
}
