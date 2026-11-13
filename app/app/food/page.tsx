"use client";

import { DayDetails } from "@/components/CalorieDetails";
import { PrepBoxes } from "@/components/PrepBoxes";
import { ShoppingList } from "@/components/ShoppingList";
import { amountText, nameKey, unitKey } from "@/lib/shop-cats";
import { Dot, MacLabel, MacLine } from "@/components/Mac";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, FileText, Plus, ThumbsDown, ThumbsUp, Utensils, X } from "lucide-react";
import { ClientShell, Empty, Loading, useToast } from "@/components/ui";
import { FoodDiary } from "@/components/FoodDiary";
import { CalorieCard } from "@/components/CalorieCard";
import { PlanOffer } from "@/components/PlanOffer";
import { accountOf } from "@/lib/account";
import { ramadanMealSlot } from "@/lib/ramadan";
import { smartSwaps, type SwapOption } from "@/lib/smart-swap";
import { loadBase } from "@/lib/base-foods";
import { ShareSheet } from "@/components/ShareSheet";
import type { ShareCard } from "@/lib/share-card";
import { planMealFor, resolve, tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { ingredientText, todayKey, waterCups, type Meal, type MealPlanData } from "@/lib/plan-data";
import { saveRow } from "@/lib/offline";
import { supabase } from "@/lib/supabase";
import { DayStatsSync } from "@/components/DaySummary";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";

type ShopExtra = { id: string; name: string; amount: string };
type Choices = { meals: Record<string, MealRef>; ings: Record<string, string>; shop: Record<string, boolean>; rates: Record<string, 1 | -1>; extra?: ShopExtra[] };
/** Something she ate outside the plan (meals._off). */
type OffItem = { t: string; cal?: number; at: string };
/** Day check-in kept inside the day's log (meals._day). */
type DayNote = { steps?: string; sleep?: string; notes?: string };
type Log = { meals: Record<string, boolean | DayNote | OffItem[]>; water: number };
type Sheet = { type: "meal"; key: string; slot: string } | { type: "ing"; key: string; original: string; options: string[] } | { type: "smart"; key: string; original: string; options: SwapOption[] | null } | null;
type Tab = "meals" | "shop" | "diary";



function slotEmoji(slot: string) {
  if (/سحور/.test(slot)) return "🌌";
  if (/بينية/.test(slot)) return "🥣";
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

const TAB_KEY = "zf-food-tab";

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
  const [cups, setCups] = useState(10);
  const [openMeals, setOpenMeals] = useState<Set<string>>(new Set());
  const [todayDay, setTodayDay] = useState(0);
  const [focusSnacks, setFocusSnacks] = useState(false);
  const [share, setShare] = useState<ShareCard | null>(null);
  const [freeTab, setFreeTab] = useState<"diary" | "meals">("diary");
  useEffect(() => {
    // «علب جاهزة» opens on the diary tab; otherwise the last tab she used today.
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("boxes") === "1" || sp.get("tab") === "diary") {
      setTab("diary");
      setFreeTab("diary");
      return;
    }
    try {
      const m = JSON.parse(localStorage.getItem(TAB_KEY) || "null") as { d: string; t: Tab } | null;
      if (m && m.d === todayKey() && (m.t === "meals" || m.t === "diary" || m.t === "shop")) {
        setTab(m.t);
        if (m.t !== "shop") setFreeTab(m.t);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, JSON.stringify({ d: todayKey(), t: tab })); } catch {}
  }, [tab]);
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, JSON.stringify({ d: todayKey(), t: freeTab })); } catch {}
  }, [freeTab]);
  const [todayFood, setTodayFood] = useState({ cal: 0, p: 0, c: 0, f: 0 });
  const [ready, setReady] = useState(false);
  const today = todayKey();

  const plan = cp.meal;
  const row = cp.mealRow;
  useEffect(() => {
    if (row?.id) try { localStorage.setItem(`zf-newplan-${row.id}`, "1"); } catch {}
  }, [row?.id]);

  useEffect(() => {
    if (cp.loading) return;
    if (!plan || !row || !cp.client) {
      setReady(true);
      return;
    }
    const since = Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 864e5));
    setDay(since % plan.days.length);
    setTodayDay(since % plan.days.length);
    (async () => {
      supabase.from("body_logs").select("weight_kg").eq("client_id", cp.client!.id).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => setCups(waterCups(data?.weight_kg ? Number(data.weight_kg) : null)));
      const [{ data: ch }, { data: lg }] = await Promise.all([
        supabase.from("plan_choices").select("data").eq("plan_id", row.id).maybeSingle(),
        supabase.from("daily_logs").select("meals, water").eq("client_id", cp.client!.id).eq("log_date", today).maybeSingle()
      ]);
      const c = (ch?.data || {}) as Partial<Choices>;
      setChoices({ meals: c.meals || {}, ings: c.ings || {}, shop: c.shop || {}, rates: c.rates || {}, extra: Array.isArray(c.extra) ? c.extra : [] });
      if (lg) {
        const meals = (lg.meals as Log["meals"]) || {};
        setLog({ meals, water: lg.water || 0 });
        setDayNote((meals._day as DayNote) || {});
      }
      setReady(true);
    })();
  }, [cp.loading, plan, row, cp.client, today]);

  // Food she logged in «سعراتي» today, so both tabs show the same numbers.
  useEffect(() => {
    if (!cp.client || tab !== "meals") return;
    supabase.from("food_entries").select("cal, p, c, f").eq("client_id", cp.client.id).eq("log_date", today).then(({ data }) => {
      const t = { cal: 0, p: 0, c: 0, f: 0 };
      ((data as { cal: number; p: number; c: number; f: number }[] | null) || []).forEach((e) => {
        t.cal += Number(e.cal); t.p += Number(e.p); t.c += Number(e.c); t.f += Number(e.f);
      });
      setTodayFood(t);
    });
  }, [cp.client, tab, today]);

  async function saveChoices(next: Choices) {
    setChoices(next);
    const { error } = await supabase.from("plan_choices").upsert({ plan_id: row!.id, client_id: cp.client!.id, data: next }, { onConflict: "plan_id" });
    if (error) toast.show("ما انحفظ. تأكدي من الاتصال.");
  }

  async function saveLog(next: Log, msg?: string) {
    setLog(next);
    const r = await saveRow("daily_logs", { client_id: cp.client!.id, log_date: today, meals: next.meals, water: next.water }, "client_id,log_date");
    if (!r.ok) toast.show("ما انحفظ. تأكدي من الاتصال.");
    else if (msg) toast.show(r.queued ? `${msg} (في جوالك لين يرجع النت)` : msg);
  }

  // Ramadan with her regular plan: the same meals over فطور / وجبة بينية / سحور.
  const relabel = cp.ramadan && cp.mealRow?.variant !== "ramadan";
  const slotFor = useCallback((d: number, m: number) => (relabel && plan ? ramadanMealSlot(m, plan.days[d].meals.length) : plan?.days[d].meals[m].slot || ""), [relabel, plan]);
  const meals = useMemo(() => {
    if (!plan || day === null) return [];
    return plan.days[day].meals.map((_, m) => {
      const key = `${day}-${m}`;
      return { key, meal: resolve(plan, choices.meals[key], day, m), swapped: Boolean(choices.meals[key]), slot: slotFor(day, m) };
    });
  }, [plan, day, choices.meals, slotFor]);

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
          const k = `${nameKey(ing.n)}|${unitKey(ing.u)}`;
          const cur = sums.get(k);
          sums.set(k, { name: cur?.name || nameKey(ing.n), u: cur?.u || ing.u, a: (cur?.a || 0) + ing.a });
        });
      })
    );
    const items = [
      ...Array.from(sums.entries()).map(([k, v]) => ({ key: k, name: v.name, amount: amountText(v.a, v.u) })),
      ...Array.from(swapped.entries()).map(([t, n]) => ({ key: `swap|${t}`, name: t, amount: n > 1 ? `× ${n}` : "" }))
    ].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return { items, taste: Array.from(taste).sort((a, b) => a.localeCompare(b, "ar")) };
  }, [plan, choices.meals, choices.ings]);

  /** A ticked key → the meal she ate (with her swaps), for the diary. */
  const planMeal = useCallback((key: string): Meal | null => {
    const m = planMealFor(plan, choices.meals, key);
    const dm = key.match(/^(\d+)-(\d+)$/);
    return m && dm ? { ...m, slot: slotFor(Number(dm[1]), Number(dm[2])) } : m;
  }, [plan, choices.meals, slotFor]);

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;

  const acc = accountOf(auth.profile);
  // «تفاصيل أكثر»: hidden when she chose no numbers, or the coach hid it for her.
  const showDetails = !auth.profile.hide_numbers && !(cp.client as { hide_micros?: boolean } | null)?.hide_micros;
  const detailsProp = showDetails ? { male: auth.profile.gender === "male" } : null;
  const hide = Boolean(auth.profile.hide_numbers);
  if ((!plan || day === null || !acc.sub) && cp.client) {
    return (
      <ClientShell title="أكلي">
        <div className="seg-tabs" role="tablist" aria-label="أقسام أكلي">
          {([["diary", "سعراتي"], ["meals", "وجباتي"]] as ["diary" | "meals", string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={freeTab === k} onClick={() => setFreeTab(k)}>{l}</button>
          ))}
        </div>
        {freeTab === "diary" ? (
          <FoodDiary clientId={cp.client.id} profileId={auth.profile.id} planTarget={null} planMeal={null} ramadan={cp.ramadan} details={detailsProp} hide={hide} afterMeals={<PrepBoxes clientId={cp.client.id} onLogged={() => window.location.reload()} />} />
        ) : <PlanOffer clientId={cp.client.id} sub={acc.sub} locked={Boolean(plan) && !acc.sub} />}
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
            "أول ما ترسل المدربة خطتك، تشوفين وجباتك هنا يوم بيوم، وتبدلين الأصناف، وتعلمين على اللي أكلتيه."
          )}
        </Empty>
      </ClientShell>
    );
  }

  // Today's numbers: ticked plan meals + food logged in «سعراتي». Starts from zero.
  const ticked = tickedMeals(plan, choices.meals, log.meals as Record<string, unknown>);
  const eatenToday = ticked.reduce((t, x) => ({ cal: t.cal + x.meal.cal, p: t.p + x.meal.p, c: t.c + x.meal.c, f: t.f + x.meal.f }), { ...todayFood });
  const target = plan.target.cal ? plan.target : null;
  const todayMeals = plan.days[todayDay]?.meals.map((_, m) => {
    const key = `${todayDay}-${m}`;
    return { key, meal: resolve(plan, choices.meals[key], todayDay, m), slot: slotFor(todayDay, m) };
  }) || [];
  const eatenCount = todayMeals.filter((x) => log.meals[x.key] === true).length;

  /** The line under the card: next meal, then open calories, or how much over. */
  const smartLine = (eatenCal: number) => {
    const left = target ? Math.round(target.cal - eatenCal) : null;
    if (left !== null && left < -40) return hide ? <>زدتي عن هدفك اليوم شوي. عادي يصير، بكرا يوم جديد.</> : <>زدتي <b className="num">{-left}</b> سعرة عن هدفك اليوم. عادي يصير، بكرا يوم جديد.</>;
    const next = todayMeals.find((x) => log.meals[x.key] !== true);
    const goNext = () => {
      setTab("meals");
      setDay(todayDay);
      setOpenMeals(new Set([next!.key]));
      setTimeout(() => document.getElementById(`meal-${next!.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    };
    if (next) {
      return (
        <button type="button" className="cal-line-btn" onClick={goNext}>
          {eatenCount ? "الوجبة الجاية" : "ابدئي يومك بـ"}: <b>{next.slot}</b> · {next.meal.name}{hide ? "" : ` (${next.meal.cal} سعرة)`}
        </button>
      );
    }
    if (left !== null && left > 40) {
      return (
        <button type="button" className="cal-line-btn" onClick={() => { setFocusSnacks(true); setTab("diary"); }}>
          {hide ? <>خلصتي وجبات اليوم، وباقي لك مجال لسناك. شوفي «سناكات مقترحة»</> : <>خلصتي وجبات اليوم، باقي لك <b className="num">{left}</b> سعرة. شوفي «سناكات مقترحة»</>}
        </button>
      );
    }
    return null;
  };

  const pdf = cp.pdfs.find((f) => /غذائي/.test(f.title)) || cp.pdfs.find((f) => f.kind === "nutrition");

  function mealCard(key: string, meal: Meal, slot: string, opts: { swapped?: boolean; swapMeal?: boolean }) {
    const steps = prepSteps(meal.prep);
    const eaten = log.meals[key] === true;
    const isOpen = openMeals.has(key);
    const toggle = () => {
      const next = new Set(openMeals);
      if (isOpen) next.delete(key);
      else next.add(key);
      setOpenMeals(next);
    };
    return (
      <section key={key} id={`meal-${key}`} className={`mcard ${eaten ? "eaten" : ""} ${isOpen ? "open" : ""}`} aria-label={meal.name}>
        <div className="mc-top">
          <button type="button" className="mc-eat" aria-pressed={eaten} aria-label={eaten ? `أكلتيها: ${meal.name}` : `علمي إنك أكلتي ${meal.name}`} onClick={() => saveLog({ ...log, meals: { ...log.meals, [key]: !eaten } })}>
            <Check />
          </button>
          <button type="button" className="mc-head" aria-expanded={isOpen} onClick={toggle}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="slot">
                {slot}
                {opts.swapped ? " · بدلتيها" : ""}
              </span>
              <b className="mc-name">{meal.name}</b>
              {hide ? null : <span className="mc-mac"><MacLine p={Math.round(meal.p)} c={Math.round(meal.c)} f={Math.round(meal.f)} unit=" غ" /></span>}
            </span>
            {hide ? null : <span className="kcal2"><b className="num">{meal.cal}</b><small>سعرة</small></span>}
            <ChevronDown className="mc-chev" aria-hidden="true" />
          </button>
        </div>
        {isOpen ? (
        <>
        {hide ? null : <div className="mrow">
          <div className="mtile" style={{ "--c": "var(--protein)" } as React.CSSProperties}><b>{Math.round(meal.p)} غ</b><span><MacLabel k="p" /></span></div>
          <div className="mtile" style={{ "--c": "var(--carb)" } as React.CSSProperties}><b>{Math.round(meal.c)} غ</b><span><MacLabel k="c" /></span></div>
          <div className="mtile" style={{ "--c": "var(--fat)" } as React.CSSProperties}><b>{Math.round(meal.f)} غ</b><span><MacLabel k="f" /></span></div>
        </div>}
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
                  <button type="button" className="swap" aria-label={`بدلي ${ing.n}`} onClick={() => setSheet({ type: "ing", key: ik, original: ingredientText(ing), options: subs })}>
                    <ArrowLeftRight />
                    بدلي
                  </button>
                ) : null}
                {!toTaste(ing.a, ing.u) ? (
                  <button type="button" className="swap ghost" aria-label={`ما عندي ${ing.n}`} onClick={async () => {
                    setSheet({ type: "smart", key: ik, original: ingredientText(ing), options: null });
                    const base = await loadBase();
                    setSheet({ type: "smart", key: ik, original: ingredientText(ing), options: smartSwaps(ing, base) });
                  }}>
                    ما عندي؟
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {meal.note ? <p className="note" style={{ padding: "0 16px 10px" }}>{meal.note}</p> : null}
        {steps.length ? (
          <details className="prep-box">
            <summary>طريقة التحضير</summary>
            <ol>{steps.map((st, n) => <li key={n}>{st}</li>)}</ol>
          </details>
        ) : null}
        {/^\d+-\d+$/.test(key) ? (
          <Link className="prep-link" href={`/app/prep?d=${key.split("-")[0]}&m=${key.split("-")[1]}`}>حضري منها كمية</Link>
        ) : null}
        <div className="rate-row">
          <span>عجبتك؟</span>
          {([[1, <ThumbsUp key="u" size={18} />, "عجبتني"], [-1, <ThumbsDown key="d" size={18} />, "ما عجبتني"]] as [1 | -1, React.ReactNode, string][]).map(([v, em, l]) => {
            const on = choices.rates[meal.name] === v;
            return (
              <button key={v} type="button" aria-pressed={on} aria-label={l} onClick={() => {
                const rates = { ...choices.rates };
                if (on) delete rates[meal.name];
                else rates[meal.name] = v;
                saveChoices({ ...choices, rates });
                if (!on) toast.show(v === 1 ? "حلو، بتعرف المدربة إنها عجبتك" : "وصلت ملاحظتك، المدربة بتشوفها بالخطة الجاية");
              }}>{em}</button>
            );
          })}
        </div>
        <div className="mfoot">
          <button type="button" className="eat" aria-pressed={eaten} onClick={() => saveLog({ ...log, meals: { ...log.meals, [key]: !eaten } })} style={{ marginInlineStart: 0 }}>
            <Check />
            {eaten ? "أكلتها" : "علمي إنك أكلتيها"}
          </button>
          {opts.swapMeal ? (
            <button type="button" className="link" style={{ marginInlineStart: "auto" }} onClick={() => setSheet({ type: "meal", key, slot })}>
              <ArrowLeftRight />
              بدلي الوجبة
            </button>
          ) : null}
        </div>
        </>
        ) : null}
      </section>
    );
  }

  return (
    <ClientShell title="أكلي">
      <div className="seg-tabs" role="tablist" aria-label="أقسام أكلي">
        {([["meals", "وجباتي"], ["diary", "سعراتي"], ["shop", "تسوق"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setFocusSnacks(false); setTab(k); }}>{l}</button>
        ))}
      </div>

      {tab === "meals" ? (
        <>
          {plan.coachNote ? (
            <div className="reply">
              <b>من المدربة</b>
              <p style={{ whiteSpace: "pre-line" }}>{plan.coachNote}</p>
            </div>
          ) : null}
          <div className="days" role="group" aria-label="أيام الجدول">
            {plan.days.map((d, i) => (
              <button key={i} type="button" className="day-pill" aria-pressed={i === day} onClick={() => setDay(i)}>
                <span>اليوم</span>
                <b className="num">{d.n}</b>
              </button>
            ))}
          </div>

          <CalorieCard
            totals={eatenToday}
            target={target}
            hide={hide}
            header={
              <div className="row between" style={{ alignItems: "center" }}>
                <b className="cal-today">اليوم</b>
                {todayMeals.length ? <span className="cal-chip"><span className="num">{eatenCount}</span> من <span className="num">{todayMeals.length}</span> وجبات</span> : null}
              </div>
            }
            line={smartLine(eatenToday.cal)}
            details={showDetails && cp.client ? <DayDetails clientId={cp.client.id} date={today} meals={ticked.map((x) => x.meal)} male={auth.profile.gender === "male"} refresh={Math.round(todayFood.cal)} /> : undefined}
          />
          {cp.client ? <DayStatsSync clientId={cp.client.id} day={today} n={{ cal: eatenToday.cal, p: eatenToday.p, c: eatenToday.c, f: eatenToday.f, target_cal: target?.cal || null, target_p: target?.p || null, water: log.water, water_goal: cups, meals_done: eatenCount, meals_total: todayMeals.length }} /> : null}

          {meals.map(({ key, meal, swapped, slot }) => mealCard(key, meal, slot || meal.slot, { swapped, swapMeal: true }))}

          {pdf ? (
            <a className="btn btn-s btn-block" href={pdf.href} target={pdf.external ? "_blank" : undefined} rel="noreferrer"><FileText />خطتك PDF</a>
          ) : null}

          <details className="card day-notes">
          <summary>ملاحظات اليوم <span className="note">(الخطوات، النوم، الجوع والطاقة)</span></summary>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              saveLog({ ...log, meals: { ...log.meals, _day: dayNote } }, "حفظنا متابعة اليوم");
            }}
          >
            <div className="grid2">
              <div className="field">
                <label htmlFor="steps">الخطوات</label>
                <input id="steps" className="inp num" inputMode="numeric" placeholder="8000" value={dayNote.steps || ""} onChange={(e) => setDayNote({ ...dayNote, steps: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="sleep">النوم (ساعات)</label>
                <input id="sleep" className="inp num" inputMode="decimal" placeholder="7" value={dayNote.sleep || ""} onChange={(e) => setDayNote({ ...dayNote, sleep: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="notes">ملاحظاتك (جوع، طاقة، مزاج)</label>
              <textarea id="notes" className="inp" value={dayNote.notes || ""} onChange={(e) => setDayNote({ ...dayNote, notes: e.target.value })} placeholder="مثلًا: جعت بعد الغداء، طاقتي حلوة اليوم" />
            </div>
            <button className="btn btn-s" type="submit">حفظ</button>
          </form>
          </details>
        </>
      ) : null}

      {tab === "diary" && cp.client ? (
        <FoodDiary hide={hide} details={detailsProp} clientId={cp.client.id} profileId={auth.profile.id} planTarget={plan.target.cal ? plan.target : null} planMeal={planMeal} smartLine={smartLine} ramadan={cp.ramadan} coachSnacks={[...plan.extras.snacks, ...plan.extras.salads]} focusSnacks={focusSnacks} planDone={Boolean(todayMeals?.length) && todayMeals!.every((x) => log.meals[x.key] === true)} afterMeals={<PrepBoxes clientId={cp.client.id} onLogged={() => window.location.reload()} />} />
      ) : null}

      {tab === "shop" && cp.client ? (
        <ShoppingList
          clientId={cp.client.id}
          planItems={shopping.items}
          bought={choices.shop}
          onTogglePlan={(k) => saveChoices({ ...choices, shop: { ...choices.shop, [k]: !choices.shop[k] } })}
          onClearPlan={() => saveChoices({ ...choices, shop: {} })}
          taste={shopping.taste}
          days={plan.days.length}
          legacy={choices.extra?.length ? choices.extra.map((x) => ({ name: x.name, amount: x.amount })) : undefined}
          onLegacyMoved={() => saveChoices({ ...choices, extra: [] })}
        />
      ) : null}

      {sheet ? (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="بدلي">
            <div className="row between">
              <h2 style={{ fontSize: 18 }}>{sheet.type === "meal" ? `بدلي ${sheet.slot || "الوجبة"}` : sheet.type === "smart" ? `ما عندي ${sheet.original}` : "بدلي الصنف"}</h2>
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setSheet(null)}>
                <X />
              </button>
            </div>
            {sheet.type === "smart" ? (
              <div className="opts">
                {sheet.options === null ? <p className="note">لحظة، ندور بدائل...</p> : sheet.options.length ? (
                  <>
                    <p className="small muted">بدائل من نفس النوع وبنفس السعرات والماكروز تقريبًا، والكمية محسوبة لك:</p>
                    {sheet.options.map((o) => (
                      <button key={o.label} type="button" className="opt" onClick={() => {
                        saveChoices({ ...choices, ings: { ...choices.ings, [sheet.key]: o.label } });
                        setSheet(null);
                        toast.show(`تم: ${o.label}`);
                      }}>
                        <span className="radio" />
                        <span>
                          <span className="opt-t">{o.name} <b className="num">{o.grams}</b> غ</span>
                          <span className="opt-s">{o.cal} سعرة · <MacLine p={o.p} c={o.c} f={o.f} /></span>
                        </span>
                      </button>
                    ))}
                    {choices.ings[sheet.key] ? (
                      <button type="button" className="btn btn-g" onClick={() => { const ings = { ...choices.ings }; delete ings[sheet.key]; saveChoices({ ...choices, ings }); setSheet(null); }}>رجعي للصنف الأصلي</button>
                    ) : null}
                  </>
                ) : (
                  <p className="alert info">ما لقينا بديل محسوب لهالصنف. جربي زر «بدلي» لو موجود، أو اسألي المدربة.</p>
                )}
              </div>
            ) : sheet.type === "ing" ? (
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
      {share ? <ShareSheet card={share} onClose={() => setShare(null)} /> : null}
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
            <span className="opt-s">{o.where} · {o.meal.cal} سعرة · <MacLine p={Math.round(o.meal.p)} c={Math.round(o.meal.c)} f={Math.round(o.meal.f)} /> جم</span>
          </span>
        </button>
      ))}
    </div>
  );
}
