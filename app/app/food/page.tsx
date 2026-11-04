"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, FileText, Utensils, X } from "lucide-react";
import { ClientShell, Empty, Loading, useToast } from "@/components/ui";
import { ingredientText, todayKey, type Meal, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";

type MealRef = { d: number; m: number } | { e: "snacks" | "salads"; i: number };
type Choices = { meals: Record<string, MealRef>; ings: Record<string, string> };
type Log = { meals: Record<string, boolean>; water: number };
type Sheet = { type: "meal"; key: string; slot: string } | { type: "ing"; key: string; original: string; options: string[] } | null;

const CUPS = 10;

function resolve(plan: MealPlanData, ref: MealRef | undefined, d: number, m: number): Meal {
  if (ref && "e" in ref) return plan.extras[ref.e][ref.i] || plan.days[d].meals[m];
  if (ref && "d" in ref) return plan.days[ref.d]?.meals[ref.m] || plan.days[d].meals[m];
  return plan.days[d].meals[m];
}

function slotEmoji(slot: string) {
  if (/فطور/.test(slot)) return "🌅";
  if (/غداء/.test(slot)) return "☀️";
  if (/عشاء/.test(slot)) return "🌙";
  if (/سناك|سناك/.test(slot)) return "🍎";
  return "🍽️";
}

/** "1. … 2. …" → steps. */
function prepSteps(prep: string) {
  if (!prep.trim()) return [];
  const parts = prep.split(/\s*\d+\.\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [prep.trim()];
}

function subsFor(meal: Meal, ingName: string) {
  const n = ingName.toLowerCase();
  const s = meal.subs.find((x) => {
    const sn = x.for.toLowerCase();
    return sn === n || n.includes(sn.split(" ")[0]) || sn.includes(n.split(" ")[0]);
  });
  return s?.options || [];
}

export default function FoodPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const [day, setDay] = useState<number | null>(null);
  const [choices, setChoices] = useState<Choices>({ meals: {}, ings: {} });
  const [log, setLog] = useState<Log>({ meals: {}, water: 0 });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ready, setReady] = useState(false);
  const today = todayKey();

  const plan = cp.meal;
  const row = cp.mealRow;

  useEffect(() => {
    if (cp.loading) return;
    if (!plan || !row || !cp.client) {
      setReady(true);
      return;
    }
    const since = Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 864e5));
    setDay(since % plan.days.length);
    (async () => {
      const [{ data: ch }, { data: lg }] = await Promise.all([
        supabase.from("plan_choices").select("data").eq("plan_id", row.id).maybeSingle(),
        supabase.from("daily_logs").select("meals, water").eq("client_id", cp.client!.id).eq("log_date", today).maybeSingle()
      ]);
      const c = (ch?.data || {}) as Partial<Choices>;
      setChoices({ meals: c.meals || {}, ings: c.ings || {} });
      if (lg) setLog({ meals: (lg.meals as Log["meals"]) || {}, water: lg.water || 0 });
      setReady(true);
    })();
  }, [cp.loading, plan, row, cp.client, today]);

  async function saveChoices(next: Choices) {
    setChoices(next);
    const { error } = await supabase.from("plan_choices").upsert({ plan_id: row!.id, client_id: cp.client!.id, data: next }, { onConflict: "plan_id" });
    if (error) toast.show("ما انحفظ التبديل. تأكدي من الاتصال.");
  }

  async function saveLog(next: Log) {
    setLog(next);
    const { error } = await supabase.from("daily_logs").upsert({ client_id: cp.client!.id, log_date: today, meals: next.meals, water: next.water }, { onConflict: "client_id,log_date" });
    if (error) toast.show("ما انحفظ. تأكدي من الاتصال.");
  }

  const meals = useMemo(() => {
    if (!plan || day === null) return [];
    return plan.days[day].meals.map((_, m) => {
      const key = `${day}-${m}`;
      return { key, meal: resolve(plan, choices.meals[key], day, m), swapped: Boolean(choices.meals[key]), slot: plan.days[day].meals[m].slot };
    });
  }, [plan, day, choices.meals]);

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;

  if (!plan || day === null) {
    return (
      <ClientShell title="أكلي">
        <Empty icon={<Utensils />} title="خطتك الغذائية بتطلع هنا">
          {cp.files.length ? (
            <>
              المدربة أرسلت خطتك كملف. <Link className="link" href="/app">افتحيها من الرئيسية</Link>
            </>
          ) : (
            "أول ما ترسل المدربة خطتك، تشوفين وجباتك هنا يوم بيوم، وتبدلين الأصناف، وتعلّمين على اللي أكلتيه."
          )}
        </Empty>
      </ClientShell>
    );
  }

  const total = meals.reduce((t, x) => ({ cal: t.cal + x.meal.cal, p: t.p + x.meal.p, c: t.c + x.meal.c, f: t.f + x.meal.f }), { cal: 0, p: 0, c: 0, f: 0 });
  const MACROS: [string, number, number, string][] = [
    ["بروتين", total.p, plan.target.p, "var(--protein)"],
    ["كارب", total.c, plan.target.c, "var(--carb)"],
    ["دهون", total.f, plan.target.f, "var(--fat)"]
  ];
  const eatenCount = meals.filter((x) => log.meals[x.key]).length;
  const open = Math.round(plan.target.cal - total.cal);
  const pdf = cp.pdfs.find((f) => /غذائي/.test(f.title)) || cp.pdfs.find((f) => f.kind === "nutrition");

  return (
    <ClientShell title="أكلي" action={pdf ? <a className="btn btn-g btn-sm" href={pdf.href} target={pdf.external ? "_blank" : undefined} rel="noreferrer"><FileText />PDF</a> : undefined}>
      <div className="days" role="group" aria-label="أيام الجدول">
        {plan.days.map((d, i) => (
          <button key={i} type="button" className="day-pill" aria-pressed={i === day} onClick={() => setDay(i)}>
            <span>اليوم</span>
            <b className="num">{d.n}</b>
          </button>
        ))}
      </div>

      <section className="card stack" style={{ gap: 12 }}>
        <div className="row between" style={{ alignItems: "center" }}>
          <div>
            <span className="label">🔥 سعرات اليوم {day + 1}</span>
            <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
              <b className="num" style={{ fontSize: 32, lineHeight: 1.1, color: "var(--navy)" }}>{Math.round(total.cal)}</b>
              <span className="muted small">{plan.target.cal ? `من ${plan.target.cal} سعرة` : "سعرة"}</span>
            </div>
          </div>
          <span className="chip green">✅ {eatenCount} من {meals.length} وجبات</span>
        </div>
        <div className="grid3">
          {MACROS.map(([label, v, target, color]) => (
            <div key={label} className="mtile" style={{ "--c": color, textAlign: "start" } as React.CSSProperties}>
              <span>{label}</span>
              <b>{Math.round(v)}g</b>
              {target ? (
                <>
                  <span className="bar" aria-hidden="true" style={{ display: "block", height: 5, borderRadius: 99, background: "var(--line)", overflow: "hidden", margin: "4px 0 2px" }}>
                    <i style={{ display: "block", height: "100%", width: `${Math.min(100, (v / target) * 100)}%`, background: color }} />
                  </span>
                  <span>هدفك {Math.round(target)}g</span>
                </>
              ) : null}
            </div>
          ))}
        </div>
        {open > 40 ? (
          <div className="tip-card">
            <span className="em" aria-hidden="true">🔓</span>
            <span>عندك <b>{open} سعرة مفتوحة</b> اليوم. خذيها كيف ما تبين: قهوة بحليب، فاكهة، أو قطعة شوكولاتة.</span>
          </div>
        ) : null}
      </section>

      <div className="tip-card">
        <span className="em" aria-hidden="true">🔁</span>
        <span>ما تبين صنف؟ اضغطي <b>بدّلي</b> جنبه. وتقدرين تبدلين الوجبة كاملة بوجبة من نفس الخانة.</span>
      </div>

      {meals.map(({ key, meal, swapped, slot }) => {
        const steps = prepSteps(meal.prep);
        const eaten = Boolean(log.meals[key]);
        return (
          <section key={key} className={`mcard ${eaten ? "eaten" : ""}`} aria-label={meal.name}>
            <div className="mcard-h">
              <div style={{ minWidth: 0 }}>
                <span className="slot">
                  <span aria-hidden="true">{slotEmoji(slot || meal.slot)}</span>
                  {slot || meal.slot}
                  {swapped ? " · بدلتيها" : ""}
                </span>
                <h3>{meal.name}</h3>
              </div>
              <span className="kcal">
                <b>{meal.cal}</b>
                <span>سعرة</span>
              </span>
            </div>
            <div className="mrow">
              <div className="mtile" style={{ "--c": "var(--protein)" } as React.CSSProperties}><b>{Math.round(meal.p)}g</b><span>بروتين</span></div>
              <div className="mtile" style={{ "--c": "var(--carb)" } as React.CSSProperties}><b>{Math.round(meal.c)}g</b><span>كارب</span></div>
              <div className="mtile" style={{ "--c": "var(--fat)" } as React.CSSProperties}><b>{Math.round(meal.f)}g</b><span>دهون</span></div>
            </div>
            <div className="ings">
              {meal.ingredients.map((ing) => {
                const ik = `${key}-${meal.name}-${ing.n}`;
                const opts = subsFor(meal, ing.n);
                const chosen = choices.ings[ik];
                const toTaste = ing.u === "حسب الذوق" || ing.a === 0 || ing.a === "";
                return (
                  <div key={ing.n} className="ing">
                    <span className="nm">
                      {chosen ? <>{chosen} <span className="swapped">· بديل</span></> : ing.n}
                    </span>
                    {chosen ? null : toTaste ? <span className="note">حسب الذوق</span> : <span className="amt">{ing.a}<small>{ing.u}</small></span>}
                    {opts.length ? (
                      <button type="button" className="swap" aria-label={`بدّلي ${ing.n}`} onClick={() => setSheet({ type: "ing", key: ik, original: ingredientText(ing), options: opts })}>
                        <ArrowLeftRight />
                        بدّلي
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {meal.note ? <p className="note" style={{ padding: "0 16px 10px" }}>{meal.note}</p> : null}
            {steps.length ? (
              <details className="prep-box">
                <summary>👩‍🍳 طريقة التحضير</summary>
                <ol>{steps.map((st, n) => <li key={n}>{st}</li>)}</ol>
              </details>
            ) : null}
            <div className="mfoot">
              <button type="button" className="eat" aria-pressed={eaten} onClick={() => saveLog({ ...log, meals: { ...log.meals, [key]: !eaten } })} style={{ marginInlineStart: 0 }}>
                <Check />
                {eaten ? "أكلتها" : "علّمي إنك أكلتيها"}
              </button>
              <button type="button" className="link" style={{ marginInlineStart: "auto" }} onClick={() => setSheet({ type: "meal", key, slot })}>
                <ArrowLeftRight />
                بدّلي الوجبة
              </button>
            </div>
          </section>
        );
      })}

      <div className="sec-title">
        <span className="em" aria-hidden="true">💧</span>
        <h2>الماء</h2>
        <span className="aside num">{log.water} / {CUPS} أكواب</span>
      </div>
      <section className="card stack">
        <div className="cups">
          {Array.from({ length: CUPS }, (_, i) => (
            <button key={i} type="button" className={`cup ${i < log.water ? "full" : ""}`} aria-label={`كوب ${i + 1}`} onClick={() => saveLog({ ...log, water: log.water === i + 1 ? i : i + 1 })} />
          ))}
        </div>
        <p className="note">كل كوب ٢٥٠ مل. هدفك ٢ إلى ٢.٥ لتر في اليوم.</p>
      </section>

      {sheet ? (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="بدّلي">
            <div className="row between">
              <h2 style={{ fontSize: 18 }}>{sheet.type === "meal" ? `بدّلي ${sheet.slot || "الوجبة"}` : "بدّلي الصنف"}</h2>
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setSheet(null)}>
                <X />
              </button>
            </div>
            {sheet.type === "ing" ? (
              <div className="opts">
                {[sheet.original, ...sheet.options].map((o, i) => {
                  const on = i === 0 ? !choices.ings[sheet.key] : choices.ings[sheet.key] === o;
                  return (
                    <button key={o} type="button" className="opt" aria-pressed={on} onClick={() => {
                      const ings = { ...choices.ings };
                      if (i === 0) delete ings[sheet.key];
                      else ings[sheet.key] = o;
                      saveChoices({ ...choices, ings });
                      setSheet(null);
                      toast.show("تم التبديل");
                    }}>
                      <span className="radio" />
                      <span>
                        <span className="opt-t">{o}</span>
                        {i === 0 ? <span className="opt-s">اختيار المدربة</span> : null}
                      </span>
                    </button>
                  );
                })}
                <p className="note">البدائل كمياتها محسوبة عشان تكون قريبة من الصنف الأصلي.</p>
              </div>
            ) : (
              <MealOptions plan={plan} slot={sheet.slot} current={choices.meals[sheet.key]} onPick={(ref) => {
                const mealsCh = { ...choices.meals };
                if (ref) mealsCh[sheet.key] = ref;
                else delete mealsCh[sheet.key];
                saveChoices({ ...choices, meals: mealsCh });
                setSheet(null);
                toast.show("تم تبديل الوجبة");
              }} />
            )}
          </div>
        </div>
      ) : null}
      {toast.node}
    </ClientShell>
  );
}

function MealOptions({ plan, slot, current, onPick }: { plan: MealPlanData; slot: string; current?: MealRef; onPick: (r: MealRef | null) => void }) {
  const same = (a: MealRef | undefined, b: MealRef) => JSON.stringify(a) === JSON.stringify(b);
  const options: { ref: MealRef; meal: Meal; where: string }[] = [];
  const seen = new Set<string>();
  plan.days.forEach((d, di) =>
    d.meals.forEach((m, mi) => {
      if (m.slot === slot && !seen.has(m.name)) {
        seen.add(m.name);
        options.push({ ref: { d: di, m: mi }, meal: m, where: `من اليوم ${d.n}` });
      }
    })
  );
  if (/سناك|snack/i.test(slot)) {
    plan.extras.snacks.forEach((m, i) => options.push({ ref: { e: "snacks", i }, meal: m, where: "سناك إضافي" }));
  }
  return (
    <div className="opts">
      <button type="button" className="opt" aria-pressed={!current} onClick={() => onPick(null)}>
        <span className="radio" />
        <span>
          <span className="opt-t">الوجبة الأصلية لهاليوم</span>
          <span className="opt-s">اختيار المدربة</span>
        </span>
      </button>
      {options.map((o) => (
        <button key={JSON.stringify(o.ref)} type="button" className="opt" aria-pressed={same(current, o.ref)} onClick={() => onPick(o.ref)}>
          <span className="radio" />
          <span style={{ minWidth: 0 }}>
            <span className="opt-t">{o.meal.name}</span>
            <span className="opt-s">{o.where} · {o.meal.cal} سعرة · بروتين {Math.round(o.meal.p)} · كارب {Math.round(o.meal.c)} · دهون {Math.round(o.meal.f)} جم</span>
          </span>
        </button>
      ))}
    </div>
  );
}
