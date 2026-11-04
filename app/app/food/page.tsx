"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, FileText, Utensils, X } from "lucide-react";
import { ClientShell, Empty, Loading, useToast } from "@/components/ui";
import { FoodDiary } from "@/components/FoodDiary";
import { ingredientText, todayKey, type Meal, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";

type MealRef = { d: number; m: number } | { e: "snacks" | "salads"; i: number };
type Choices = { meals: Record<string, MealRef>; ings: Record<string, string>; shop: Record<string, boolean>; rates: Record<string, 1 | -1> };
/** Something she ate outside the plan (meals._off). */
type OffItem = { t: string; cal?: number; at: string };
/** Day check-in kept inside the day's log (meals._day). */
type DayNote = { steps?: string; sleep?: string; notes?: string };
type Log = { meals: Record<string, boolean | DayNote | OffItem[]>; water: number };
type Sheet = { type: "meal"; key: string; slot: string } | { type: "ing"; key: string; original: string; options: string[] } | null;
type Tab = "meals" | "extras" | "shop" | "diary";

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
  if (/سناك/.test(slot)) return "🍎";
  if (/سلط/.test(slot)) return "🥗";
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

const toTaste = (a: number | string, u: string) => u === "حسب الذوق" || a === 0 || a === "";

export default function FoodPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("meals");
  const [day, setDay] = useState<number | null>(null);
  const [choices, setChoices] = useState<Choices>({ meals: {}, ings: {}, shop: {}, rates: {} });
  const [log, setLog] = useState<Log>({ meals: {}, water: 0 });
  const [dayNote, setDayNote] = useState<DayNote>({});
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
      setChoices({ meals: c.meals || {}, ings: c.ings || {}, shop: c.shop || {}, rates: c.rates || {} });
      if (lg) {
        const meals = (lg.meals as Log["meals"]) || {};
        setLog({ meals, water: lg.water || 0 });
        setDayNote((meals._day as DayNote) || {});
      }
      setReady(true);
    })();
  }, [cp.loading, plan, row, cp.client, today]);

  async function saveChoices(next: Choices) {
    setChoices(next);
    const { error } = await supabase.from("plan_choices").upsert({ plan_id: row!.id, client_id: cp.client!.id, data: next }, { onConflict: "plan_id" });
    if (error) toast.show("ما انحفظ. تأكدي من الاتصال.");
  }

  async function saveLog(next: Log, msg?: string) {
    setLog(next);
    const { error } = await supabase.from("daily_logs").upsert({ client_id: cp.client!.id, log_date: today, meals: next.meals, water: next.water }, { onConflict: "client_id,log_date" });
    if (error) toast.show("ما انحفظ. تأكدي من الاتصال.");
    else if (msg) toast.show(msg);
  }

  const meals = useMemo(() => {
    if (!plan || day === null) return [];
    return plan.days[day].meals.map((_, m) => {
      const key = `${day}-${m}`;
      return { key, meal: resolve(plan, choices.meals[key], day, m), swapped: Boolean(choices.meals[key]), slot: plan.days[day].meals[m].slot };
    });
  }, [plan, day, choices.meals]);

  /** The whole plan's shopping, with her meal and ingredient swaps applied. */
  const shopping = useMemo(() => {
    if (!plan) return { items: [] as { key: string; name: string; amount: string }[], taste: [] as string[] };
    const sums = new Map<string, { name: string; u: string; a: number }>();
    const swapped = new Map<string, number>();
    const taste = new Set<string>();
    plan.days.forEach((d, di) =>
      d.meals.forEach((_, mi) => {
        const key = `${di}-${mi}`;
        const meal = resolve(plan, choices.meals[key], di, mi);
        meal.ingredients.forEach((ing) => {
          const chosen = choices.ings[`${key}-${meal.name}-${ing.n}`];
          if (chosen) return swapped.set(chosen, (swapped.get(chosen) || 0) + 1);
          if (toTaste(ing.a, ing.u) || typeof ing.a !== "number") return taste.add(ing.n);
          const k = `${ing.n}|${ing.u}`;
          const cur = sums.get(k);
          sums.set(k, { name: ing.n, u: ing.u, a: (cur?.a || 0) + ing.a });
        });
      })
    );
    const items = [
      ...Array.from(sums.entries()).map(([k, v]) => ({ key: k, name: v.name, amount: `${Math.round(v.a * 10) / 10} ${v.u}` })),
      ...Array.from(swapped.entries()).map(([t, n]) => ({ key: `swap|${t}`, name: t, amount: n > 1 ? `× ${n}` : "" }))
    ].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return { items, taste: Array.from(taste).sort((a, b) => a.localeCompare(b, "ar")) };
  }, [plan, choices.meals, choices.ings]);

  /** A ticked key → the meal she ate (with her swaps), for the diary. */
  const planMeal = useCallback(
    (key: string): Meal | null => {
      if (!plan) return null;
      const x = key.match(/^x-(snacks|salads)-(\d+)$/);
      if (x) {
        const m = plan.extras[x[1] as "snacks" | "salads"][Number(x[2])];
        return m ? { ...m, slot: "سناك" } : null;
      }
      const dm = key.match(/^(\d+)-(\d+)$/);
      if (!dm || !plan.days[Number(dm[1])]?.meals[Number(dm[2])]) return null;
      const d = Number(dm[1]), m = Number(dm[2]);
      return { ...resolve(plan, choices.meals[key], d, m), slot: plan.days[d].meals[m].slot };
    },
    [plan, choices.meals]
  );

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;

  if ((!plan || day === null) && cp.client) {
    return (
      <ClientShell title="أكلي" sub="سجلي أكلك واحسبي سعراتك">
        <FoodDiary clientId={cp.client.id} profileId={auth.profile.id} planTarget={null} planMeal={null} />
        {cp.files.length ? (
          <p className="note" style={{ textAlign: "center" }}>
            خطتك من المدربة وصلت كملف. <Link className="link" href="/app">افتحيها من الرئيسية</Link>
          </p>
        ) : null}
      </ClientShell>
    );
  }

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
    ["💪 بروتين", total.p, plan.target.p, "var(--protein)"],
    ["🌾 كارب", total.c, plan.target.c, "var(--carb)"],
    ["🫒 دهون", total.f, plan.target.f, "var(--fat)"]
  ];
  const eatenCount = meals.filter((x) => log.meals[x.key] === true).length;
  const offItems = Array.isArray(log.meals._off) ? (log.meals._off as OffItem[]) : [];
  const offCal = offItems.reduce((a, x) => a + (x.cal || 0), 0);
  const extrasEaten = Object.entries(log.meals).filter(([k, v]) => k.startsWith("x-") && v === true).length;
  const open = Math.round(plan.target.cal - total.cal);
  const pdf = cp.pdfs.find((f) => /غذائي/.test(f.title)) || cp.pdfs.find((f) => f.kind === "nutrition");
  const extras = [
    ...plan.extras.snacks.map((m, i) => ({ key: `x-snacks-${i}`, meal: { ...m, slot: m.slot || "سناك" } })),
    ...plan.extras.salads.map((m, i) => ({ key: `x-salads-${i}`, meal: { ...m, slot: m.slot || "سلطة" } }))
  ];

  function mealCard(key: string, meal: Meal, slot: string, opts: { swapped?: boolean; swapMeal?: boolean }) {
    const steps = prepSteps(meal.prep);
    const eaten = log.meals[key] === true;
    return (
      <section key={key} className={`mcard ${eaten ? "eaten" : ""}`} aria-label={meal.name}>
        <div className="mcard-h">
          <div style={{ minWidth: 0 }}>
            <span className="slot">
              <span aria-hidden="true">{slotEmoji(slot)}</span>
              {slot}
              {opts.swapped ? " · بدلتيها" : ""}
            </span>
            <h3>{meal.name}</h3>
          </div>
          <span className="kcal">
            <b>{meal.cal}</b>
            <span>سعرة</span>
          </span>
        </div>
        <div className="mrow">
          <div className="mtile" style={{ "--c": "var(--protein)" } as React.CSSProperties}><b>{Math.round(meal.p)}g</b><span>💪 بروتين</span></div>
          <div className="mtile" style={{ "--c": "var(--carb)" } as React.CSSProperties}><b>{Math.round(meal.c)}g</b><span>🌾 كارب</span></div>
          <div className="mtile" style={{ "--c": "var(--fat)" } as React.CSSProperties}><b>{Math.round(meal.f)}g</b><span>🫒 دهون</span></div>
        </div>
        <div className="ings">
          {meal.ingredients.map((ing) => {
            const ik = `${key}-${meal.name}-${ing.n}`;
            const subs = subsFor(meal, ing.n);
            const chosen = choices.ings[ik];
            return (
              <div key={ing.n} className="ing">
                <span className="nm">{chosen ? <>{chosen} <span className="swapped">· بديل</span></> : ing.n}</span>
                {chosen ? null : toTaste(ing.a, ing.u) ? <span className="note">حسب الذوق</span> : <span className="amt">{ing.a}<small>{ing.u}</small></span>}
                {subs.length ? (
                  <button type="button" className="swap" aria-label={`بدّلي ${ing.n}`} onClick={() => setSheet({ type: "ing", key: ik, original: ingredientText(ing), options: subs })}>
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
        <div className="rate-row">
          <span>عجبتك؟</span>
          {([[1, "👍", "عجبتني"], [-1, "👎", "ما عجبتني"]] as [1 | -1, string, string][]).map(([v, em, l]) => {
            const on = choices.rates[meal.name] === v;
            return (
              <button key={v} type="button" aria-pressed={on} aria-label={l} onClick={() => {
                const rates = { ...choices.rates };
                if (on) delete rates[meal.name];
                else rates[meal.name] = v;
                saveChoices({ ...choices, rates });
                if (!on) toast.show(v === 1 ? "حلو! بتعرف المدربة إنها عجبتك" : "وصلت ملاحظتك، المدربة بتشوفها بالخطة الجاية");
              }}>{em}</button>
            );
          })}
        </div>
        <div className="mfoot">
          <button type="button" className="eat" aria-pressed={eaten} onClick={() => saveLog({ ...log, meals: { ...log.meals, [key]: !eaten } })} style={{ marginInlineStart: 0 }}>
            <Check />
            {eaten ? "أكلتها" : "علّمي إنك أكلتيها"}
          </button>
          {opts.swapMeal ? (
            <button type="button" className="link" style={{ marginInlineStart: "auto" }} onClick={() => setSheet({ type: "meal", key, slot })}>
              <ArrowLeftRight />
              بدّلي الوجبة
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <ClientShell title="أكلي" action={pdf ? <a className="btn btn-g btn-sm" href={pdf.href} target={pdf.external ? "_blank" : undefined} rel="noreferrer"><FileText />PDF</a> : undefined}>
      <div className="seg-tabs" role="tablist" aria-label="أقسام أكلي">
        {([["meals", "🍽️ وجباتي"], ["extras", "🍎 إضافي"], ["shop", "🛒 تسوق"], ["diary", "📒 يومياتي"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "meals" ? (
        <>
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
            {offItems.length ? <p className="small" style={{ color: "var(--clay-ink)" }}>🍔 + {offCal ? `${offCal} سعرة` : `${offItems.length} أكلات`} برا الخطة اليوم</p> : null}
            <div className="grid3">
              {MACROS.map(([label, v, target, color]) => (
                <div key={label} className="mtile" style={{ "--c": color, textAlign: "start" } as React.CSSProperties}>
                  <span>{label}</span>
                  <b>{Math.round(v)}g</b>
                  {target ? (
                    <>
                      <span aria-hidden="true" style={{ display: "block", height: 5, borderRadius: 99, background: "var(--line)", overflow: "hidden", margin: "4px 0 2px" }}>
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
                <span>عندك <b>{open} سعرة مفتوحة</b> اليوم. خذيها كيف ما تبين: قهوة بحليب، فاكهة، أو سناك من «إضافي».</span>
              </div>
            ) : null}
          </section>

          <div className="tip-card">
            <span className="em" aria-hidden="true">🔁</span>
            <span>ما تبين صنف؟ اضغطي <b>بدّلي</b> جنبه. وتقدرين تبدلين الوجبة كاملة بوجبة من نفس الخانة.</span>
          </div>

          {meals.map(({ key, meal, swapped, slot }) => mealCard(key, meal, slot || meal.slot, { swapped, swapMeal: true }))}

          <button type="button" className="tip-card" style={{ width: "100%", textAlign: "start" }} onClick={() => { setTab("diary"); window.scrollTo(0, 0); }}>
            <span className="em" aria-hidden="true">🍔</span>
            <span><b>أكلتي شي برا الخطة؟</b> عادي يصير! سجليه في <b>📒 يومياتي</b> ونحسب لك سعراته.</span>
          </button>

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

          <div className="sec-title">
            <span className="em" aria-hidden="true">📝</span>
            <h2>متابعة اليوم</h2>
          </div>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              saveLog({ ...log, meals: { ...log.meals, _day: dayNote } }, "حفظنا متابعة اليوم");
            }}
          >
            <div className="grid2">
              <div className="field">
                <label htmlFor="steps">👟 الخطوات</label>
                <input id="steps" className="inp num" inputMode="numeric" placeholder="8000" value={dayNote.steps || ""} onChange={(e) => setDayNote({ ...dayNote, steps: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="sleep">😴 النوم (ساعات)</label>
                <input id="sleep" className="inp num" inputMode="decimal" placeholder="7" value={dayNote.sleep || ""} onChange={(e) => setDayNote({ ...dayNote, sleep: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="notes">💭 ملاحظاتك (جوع، طاقة، مزاج)</label>
              <textarea id="notes" className="inp" value={dayNote.notes || ""} onChange={(e) => setDayNote({ ...dayNote, notes: e.target.value })} placeholder="مثلًا: جعت بعد الغداء، طاقتي حلوة اليوم" />
            </div>
            <button className="btn btn-s" type="submit">حفظ</button>
          </form>
        </>
      ) : null}

      {tab === "diary" && cp.client ? (
        <FoodDiary clientId={cp.client.id} profileId={auth.profile.id} planTarget={plan.target.cal ? plan.target : null} planMeal={planMeal} />
      ) : null}

      {tab === "extras" ? (
        <>
          <div className="tip-card">
            <span className="em" aria-hidden="true">🍎</span>
            <span>سناكات وسلطات اختارتها لك المدربة. خذي منها ضمن سعراتك المفتوحة، أو بدال سناك اليوم.{extrasEaten ? ` أكلتي اليوم ${extrasEaten}.` : ""}</span>
          </div>
          {extras.length ? (
            extras.map(({ key, meal }) => mealCard(key, meal, meal.slot, {}))
          ) : (
            <Empty icon={<Utensils />} title="ما فيه إضافات في جدولك">المدربة بتضيفها لك مع الجدول الجاي.</Empty>
          )}
        </>
      ) : null}

      {tab === "shop" ? (
        <>
          <div className="tip-card">
            <span className="em" aria-hidden="true">🛒</span>
            <span>كل اللي تحتاجينه لأيام جدولك ({plan.days.length} أيام)، بعد تبديلاتك. علّمي على اللي اشتريتيه. الكميات بالوزن النيء.</span>
          </div>
          <section className="card" style={{ padding: "6px 16px" }}>
            {shopping.items.map((it) => {
              const on = Boolean(choices.shop[it.key]);
              return (
                <label key={it.key} className="row" style={{ padding: "11px 0", borderTop: "1px solid var(--line)", cursor: "pointer", opacity: on ? 0.55 : 1 }}>
                  <input type="checkbox" checked={on} onChange={() => saveChoices({ ...choices, shop: { ...choices.shop, [it.key]: !on } })} style={{ width: 20, height: 20, accentColor: "var(--clay)", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, textDecoration: on ? "line-through" : "none" }}>{it.name}</span>
                  <span className="amt" style={{ fontWeight: 700, color: "var(--clay-ink)" }}>{it.amount}</span>
                </label>
              );
            })}
          </section>
          {shopping.taste.length ? (
            <>
              <div className="sec-title">
                <span className="em" aria-hidden="true">🧂</span>
                <h2>حسب الذوق</h2>
              </div>
              <section className="card">
                <p className="small" style={{ lineHeight: 2 }}>{shopping.taste.join("، ")}</p>
              </section>
            </>
          ) : null}
          {Object.values(choices.shop).some(Boolean) ? (
            <button type="button" className="btn btn-g" onClick={() => saveChoices({ ...choices, shop: {} })}>امسحي العلامات وابدئي قائمة جديدة</button>
          ) : null}
        </>
      ) : null}

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
            <span className="opt-s">{o.where} · {o.meal.cal} سعرة · 💪 {Math.round(o.meal.p)} · 🌾 {Math.round(o.meal.c)} · 🫒 {Math.round(o.meal.f)} جم</span>
          </span>
        </button>
      ))}
    </div>
  );
}
