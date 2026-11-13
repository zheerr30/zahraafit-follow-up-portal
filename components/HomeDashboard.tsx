"use client";

import { isOff, loadOff, type OffInfo } from "@/lib/off-days";
import { boxDaysLeft, loadBoxes, type Box } from "@/components/PrepBoxes";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CheckCircle2, ChevronLeft, Dumbbell, Flame, Plus, Share2, X, Droplet, Utensils } from "lucide-react";
import { ShareSheet } from "@/components/ShareSheet";
import { DaySummaryCard, DayStatsSync } from "@/components/DaySummary";
import { PlateCard } from "@/components/PlateCard";
import { CalorieCard } from "@/components/CalorieCard";
import { streakDays } from "@/components/Achievements";
import { WeekSummary } from "@/components/WeekSummary";
import { STORE_URL, type Account } from "@/lib/account";
import { addDays, followupInfo } from "@/lib/followup";
import { resolve, tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { currentPeriod, inPeriod, type PeriodLog } from "@/lib/period";
import { dayTitle, restSeconds, todayKey, waterCups, type MealPlanData, type WorkoutPlanData } from "@/lib/plan-data";
import { hijri, isRamadanMonth, ramadanActive, ramadanMealSlot, ramadanUntil } from "@/lib/ramadan";
import { saveRow } from "@/lib/offline";
import { track } from "@/components/AppStatus";
import { supabase } from "@/lib/supabase";
import type { Client, Plan, Profile } from "@/lib/types";

type Data = {
  meals: Record<string, unknown>;
  water: number;
  food: { cal: number; p: number; c: number; f: number };
  target: { cal: number; p: number; c: number; f: number } | null;
  swaps: Record<string, MealRef>;
  workouts: { performed_on: string; day_index: number; plan_id: string | null }[];
  weight: { kg: number; date: string } | null;
  weights: { kg: number; date: string }[];
  weekOn: Set<string>;
  streak: number;
  followup: { id: string; week_date: string; coach_notes: string | null; coach_replied_at: string | null } | null;
  periods: PeriodLog[];
  ramadanUntil: string | null;
  newPurchase: boolean;
  boxes: Box[];
  off: OffInfo;
};

const SEEN_KEY = "zf-seen-reply";
export const markReplySeen = (id: string) => {
  try { localStorage.setItem(SEEN_KEY, id); } catch {}
};

/**
 * Home for subscribers and free accounts: one alert at a time, the top card (plan just arrived,
 * or today's calories), «يومك», restaurants, the new-purchase card when there is one, and the
 * weekly summary on Fridays.
 */
export function HomeDashboard({ profile, client, plans, acc, readyHero }: { profile: Profile; client: Client; plans: Plan[]; acc: Account; readyHero?: ReactNode }) {
  const today = todayKey();
  const [d, setD] = useState<Data | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [planGone, setPlanGone] = useState(false);
  const [share, setShare] = useState(false);

  const mealRow = plans.find((p) => p.kind === "nutrition" && p.data && !p.variant) || null;
  const plan = acc.sub ? ((mealRow?.data as MealPlanData | undefined) || null) : null;
  const workRow = plans.find((p) => p.kind === "workout" && p.data && !p.variant) || null;
  const work = acc.sub ? ((workRow?.data as WorkoutPlanData | undefined) || null) : null;

  const load = useCallback(async () => {
    const weekAgo = addDays(today, -7);
    const [dl, fe, tg, ch, wl, bl, fu, pl, rp, np, streak, wk, wf, bx, off] = await Promise.all([
      supabase.from("daily_logs").select("meals, water").eq("client_id", client.id).eq("log_date", today).maybeSingle(),
      supabase.from("food_entries").select("cal, p, c, f").eq("client_id", client.id).eq("log_date", today),
      plan?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal, p, c, f").eq("client_id", client.id).maybeSingle(),
      mealRow && plan ? supabase.from("plan_choices").select("data").eq("plan_id", mealRow.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("workout_logs").select("performed_on, day_index, plan_id").eq("client_id", client.id).gte("performed_on", weekAgo).order("created_at", { ascending: false }),
      supabase.from("body_logs").select("log_date, weight_kg").eq("client_id", client.id).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(4),
      supabase.from("weekly_followups").select("id, week_date, coach_notes, coach_replied_at").eq("client_id", client.id).order("week_date", { ascending: false }).limit(1).maybeSingle(),
      profile.gender === "male" ? Promise.resolve({ data: [] }) : supabase.from("period_logs").select("*").eq("client_id", client.id).order("start_date", { ascending: false }).limit(3),
      supabase.from("reminder_prefs").select("ramadan_until").eq("profile_id", profile.id).maybeSingle(),
      supabase.rpc("my_new_purchase"),
      streakDays(client.id),
      supabase.from("daily_logs").select("log_date, meals").eq("client_id", client.id).gte("log_date", addDays(today, -6)),
      supabase.from("food_entries").select("log_date").eq("client_id", client.id).gte("log_date", addDays(today, -6)),
      loadBoxes(client.id),
      loadOff(client.id, addDays(today, -7))
    ]);
    const weekOn = new Set<string>(((wf.data as { log_date: string }[] | null) || []).map((x) => x.log_date));
    ((wk.data as { log_date: string; meals: Record<string, unknown> }[] | null) || []).forEach((x) => {
      if (Object.entries(x.meals || {}).some(([k, v]) => !k.startsWith("_") && v === true)) weekOn.add(x.log_date);
    });
    const food = { cal: 0, p: 0, c: 0, f: 0 };
    ((fe.data as { cal: number; p: number; c: number; f: number }[] | null) || []).forEach((x) => {
      food.cal += Number(x.cal); food.p += Number(x.p); food.c += Number(x.c); food.f += Number(x.f);
    });
    const ws = ((bl.data as { log_date: string; weight_kg: number }[] | null) || []).map((x) => ({ kg: Number(x.weight_kg), date: x.log_date })).reverse();
    setD({
      meals: ((dl.data as { meals?: Record<string, unknown> } | null)?.meals) || {},
      water: (dl.data as { water?: number } | null)?.water || 0,
      food,
      target: plan?.target.cal ? plan.target : ((tg.data as Data["target"]) || null),
      swaps: ((ch.data as { data?: { meals?: Record<string, MealRef> } } | null)?.data?.meals) || {},
      workouts: (wl.data as Data["workouts"] | null) || [],
      weight: ws.length ? ws[ws.length - 1] : null,
      weights: ws,
      weekOn,
      streak,
      followup: (fu.data as Data["followup"]) || null,
      periods: (pl.data as PeriodLog[] | null) || [],
      ramadanUntil: ((rp.data as { ramadan_until?: string | null } | null)?.ramadan_until) || null,
      newPurchase: np.data === true,
      boxes: bx || [],
      off
    });
  }, [client.id, profile.id, profile.gender, today, plan, mealRow]);

  useEffect(() => {
    load();
    // «+» → water (or anything else) saved from outside this screen.
    window.addEventListener("zf-data", load);
    return () => window.removeEventListener("zf-data", load);
  }, [load]);

  if (!d) return null;

  // ── today's food ──
  const ramadan = ramadanActive(d.ramadanUntil);
  const ticked = tickedMeals(plan, d.swaps, d.meals);
  const eaten = ticked.reduce((t, x) => ({ cal: t.cal + x.meal.cal, p: t.p + x.meal.p, c: t.c + x.meal.c, f: t.f + x.meal.f }), { ...d.food });
  const dayIdx = plan && mealRow ? Math.max(0, Math.floor((Date.now() - new Date(mealRow.created_at).getTime()) / 864e5)) % plan.days.length : 0;
  const todayMeals = plan
    ? plan.days[dayIdx].meals.map((_, m) => ({ key: `${dayIdx}-${m}`, meal: resolve(plan, d.swaps[`${dayIdx}-${m}`], dayIdx, m), slot: ramadan ? ramadanMealSlot(m, plan.days[dayIdx].meals.length) : plan.days[dayIdx].meals[m].slot }))
    : [];
  const doneCount = todayMeals.filter((x) => d.meals[x.key] === true).length;
  const next = todayMeals.find((x) => d.meals[x.key] !== true);
  const left = d.target ? Math.round(d.target.cal - eaten.cal) : null;

  // ── one alert, by priority ──
  const fu = followupInfo(client, today, acc.sub);
  const markSeen = () => { if (d.followup) markReplySeen(d.followup.id); };
  // The weekly check-in bar: Saturdays only, gone once she sends it.
  const isSaturday = new Date(today + "T12:00:00").getDay() === 6;
  const checkinDue = isSaturday && fu.openDate && d.followup?.week_date !== fu.openDate;
  const period = profile.gender !== "male" && currentPeriod(d.periods, today);
  const ramadanSuggest = isRamadanMonth(today) && hijri(today).d <= 2 && !ramadan;
  const soonBox = d.boxes.find((b) => b.place === "fridge" && boxDaysLeft(b, today) <= 1);
  // One alert at a time, as a small pill: dot + one line + an orange link.
  type Pill = { key: string; text: string; link: string; href?: string; ext?: boolean; act?: () => void };
  let seenReply: string | null = null;
  try { seenReply = localStorage.getItem(SEEN_KEY); } catch {}
  const newReply = acc.sub && Boolean(d.followup?.coach_notes && d.followup.coach_replied_at && seenReply !== d.followup.id);
  // A plan that arrived in the last 3 days (and she hasn't closed its strip).
  const newPlan = acc.sub
    ? [...plans].filter((p) => (p.kind === "workout" || p.kind === "nutrition") && p.data && !p.variant && Date.now() - new Date(p.created_at).getTime() < 3 * 864e5)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .find((p) => { try { return localStorage.getItem(`zf-newplan-${p.id}`) !== "1"; } catch { return true; } }) || null
    : null;
  let pill: Pill | null = null;
  if (acc.sub && acc.daysLeft !== null && acc.daysLeft <= 5) {
    pill = { key: "renew", text: acc.daysLeft <= 0 ? "اشتراكك ينتهي اليوم" : `باقي ${acc.daysLeft} أيام على نهاية اشتراكك`, link: "جددي", href: STORE_URL, ext: true };
  } else if (!acc.sub && acc.expired) {
    pill = { key: "expired", text: "انتهى اشتراكك، وبياناتك محفوظة", link: "جددي", href: STORE_URL, ext: true };
  } else if (newReply) {
    pill = { key: `reply-${d.followup!.id}`, text: "زهراء ردت على تسجيلك", link: "افتحيه", href: "/app/progress#coach-msg", act: () => markReplySeen(d.followup!.id) };
  } else if (checkinDue) {
    pill = { key: `checkin-${today}`, text: "وقت متابعتك الأسبوعية", link: "سجلي", href: "/app/checkin" };
  } else if (ramadanSuggest) {
    pill = { key: `ramadan-${today}`, text: "رمضان كريم، نشغل وضع رمضان؟", link: "شغليه", act: async () => {
      await supabase.from("reminder_prefs").upsert({ profile_id: profile.id, ramadan_until: ramadanUntil() }, { onConflict: "profile_id" });
      window.location.reload();
    } };
  } else if (!acc.sub && isSaturday && !(d.weight && d.weight.date >= addDays(today, -6))) {
    pill = { key: `weigh-${today}`, text: "اليوم السبت، وقت وزنك الأسبوعي", link: "سجلي", href: "/app/progress?weight=1" };
  } else if (soonBox) {
    const dl = boxDaysLeft(soonBox, today);
    pill = { key: `box-${soonBox.id}-${today}`, text: dl < 0 ? `علبة ${soonBox.name} انتهت مدتها` : `علبة ${soonBox.name} ${dl === 0 ? "كليها اليوم" : "كليها بكرة"}`, link: "افتحي", href: "/app/food?boxes=1" };
  }

  async function toggleMeal(key: string) {
    const meals = { ...d!.meals, [key]: d!.meals[key] !== true };
    setD({ ...d!, meals });
    track("meal:tick");
    await saveRow("daily_logs", { client_id: client.id, log_date: today, meals, water: d!.water }, "client_id,log_date");
  }

  // ── «يومك» ──
  async function addWater(n: number) {
    const w = Math.max(0, Math.min(20, d!.water + n));
    setD({ ...d!, water: w });
    await saveRow("daily_logs", { client_id: client.id, log_date: today, meals: d!.meals, water: w }, "client_id,log_date");
    track("water:add");
  }
  const trainedToday = d.workouts.some((w) => w.performed_on === today);
  const weekDays = new Set(d.workouts.map((w) => w.performed_on)).size;
  const lastW = d.workouts[0];
  const cups = waterCups(d.weight?.kg);
  const hide = Boolean(profile.hide_numbers);
  const restDay = Boolean(work && weekDays >= work.days.length);
  const lastNote = d.followup?.coach_notes || null;
  const todayWork = work ? work.days[lastW && lastW.plan_id === workRow?.id ? (trainedToday ? lastW.day_index : (lastW.day_index + 1) % work.days.length) : 0] || null : null;
  const workMinutes = todayWork ? Math.max(5, Math.round(todayWork.exercises.reduce((t, e) => t + e.sets * (40 + restSeconds(e.rest)), 0) / 60 / 5) * 5) : 0;
  const lastWeight = d.weight;
  const week7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  // This week from Saturday (first dot on the right). Orange = the days counted in the streak,
  // so the number of orange dots matches the number written (up to the days of this week).
  const satStart = addDays(today, -((new Date(today + "T12:00:00").getDay() + 1) % 7));
  const weekSat = Array.from({ length: 7 }, (_, i) => addDays(satStart, i));
  const streakSet = new Set<string>();
  {
    let k = d.weekOn.has(today) ? today : addDays(today, -1);
    for (let n = 0, guard = 0; n < d.streak && guard < 120; guard++, k = addDays(k, -1)) {
      if (isOff(d.off, k) && !d.weekOn.has(k)) continue;
      streakSet.add(k);
      n++;
    }
  }
  const DAY_L = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

  return (
    <>
      {pill && !dismissed ? <AlertPill pill={pill} onClose={() => setDismissed(true)} /> : null}

      <DayStatsSync clientId={client.id} day={today} n={{ cal: eaten.cal, p: eaten.p, c: eaten.c, f: eaten.f, target_cal: d.target?.cal || null, target_p: d.target?.p || null, water: d.water, water_goal: cups, meals_done: doneCount, meals_total: todayMeals.length }} />

      {newPlan ? (
        <AlertPill key={`np-${newPlan.id}`} pill={{ key: `newplan-${newPlan.id}`, text: newPlan.kind === "workout" ? "وصلك جدولك الرياضي" : "وصلك جدولك الغذائي", link: "افتحيه", href: newPlan.kind === "workout" ? "/app/workout" : "/app/food?tab=meals",
          act: () => { try { localStorage.setItem(`zf-newplan-${newPlan.id}`, "1"); } catch {} } }} onClose={() => { try { localStorage.setItem(`zf-newplan-${newPlan.id}`, "1"); } catch {} setPlanGone(true); }} hidden={planGone} />
      ) : null}

      {readyHero || <PlateCard eaten={eaten} target={d.target} off={isOff(d.off, today)} hide={hide} free={!acc.sub || !plan} />}

      <DaySummaryCard profileId={profile.id} today={today} />

      <div className="sec-title">
        <h2>يومك</h2>
        <button type="button" className="sec-link" onClick={() => setShare(true)}>شاركي</button>
      </div>
      <section className="card day-rows">
        <div className="d-row">
          <Link href="/app/food" className="d-link">
            <span className="emo" aria-hidden="true">🍽️</span>
            <span className="d-mid">
              {todayMeals.length ? (
                <>
                  <b><span className="num">{doneCount}</span> من <span className="num">{todayMeals.length}</span> وجبات</b>
                  <small>{next ? <>الجاية: {next.meal.name}</> : "خلصتي وجبات اليوم"}</small>
                </>
              ) : (
                <>
                  <b>{eaten.cal && !hide ? <><span className="num">{Math.round(eaten.cal).toLocaleString("en-US")}</span> سعرة سجلتيها</> : eaten.cal ? "سجلتي أكلك اليوم" : "ما سجلتي أكل اليوم"}</b>
                  <small>الأكل</small>
                </>
              )}
            </span>
          </Link>
          {next ? (
            <button type="button" className="btn btn-p btn-sm d-act" onClick={() => toggleMeal(next.key)}>{doneLabel(next.slot)}</button>
          ) : !todayMeals.length ? (
            <Link href="/app/food?tab=diary" className="btn btn-p btn-sm d-act">سجلي</Link>
          ) : null}
        </div>
        <div className="d-row">
          <Link href="/app/food" className="d-link">
            <span className="emo" aria-hidden="true">💧</span>
            <span className="d-mid">
              <b><span className="num">{d.water}</span> من <span className="num">{cups}</span> أكواب</b>
              <span className="cups8" aria-hidden="true">{Array.from({ length: cups }, (_, i) => <i key={i} className={i < d.water ? "on" : ""} />)}</span>
            </span>
          </Link>
          <button type="button" className="d-plus" aria-label={`أضيفي كوب ماء، شربتي ${d.water} من ${cups}`} onClick={() => addWater(1)}><Plus size={20} /></button>
        </div>
        {work && todayWork ? (
          <div className="d-row">
            <Link href="/app/workout" className="d-link">
              <span className="emo" aria-hidden="true">🏋️</span>
              <span className="d-mid">
                {trainedToday ? (
                  <><b>تمرنتي اليوم</b><small>عافية عليك</small></>
                ) : restDay ? (
                  <><b>يوم راحة</b><small>خلصتي تمارين هالأسبوع</small></>
                ) : (
                  <><b className="trunc">{dayTitle(todayWork.title)}</b><small><span className="num">{todayWork.exercises.length}</span> تمارين · <span className="num">{workMinutes}</span> دقيقة</small></>
                )}
              </span>
            </Link>
            {!trainedToday && !restDay ? <Link href="/app/workout?start=1" className="btn btn-p btn-sm d-act">ابدئي</Link> : null}
          </div>
        ) : null}
        <Link href="/app/progress" className="d-row">
          <span className="emo" aria-hidden="true">🔥</span>
          <span className="d-mid">
            <b>{d.streak > 0 ? <><span className="num">{d.streak}</span> {d.streak === 1 ? "يوم" : d.streak === 2 ? "يومين" : "أيام"} ورا بعض</> : "ابدئي سلسلتك اليوم"}</b>
          </span>
          <span className="wk-dots9" aria-label={`${d.streak} أيام ورا بعض`}>
            {weekSat.map((k) => <i key={k} className={`${streakSet.has(k) ? "on" : ""} ${k === today ? "now" : ""}`} />)}
          </span>
        </Link>
      </section>

      {acc.sub ? (
        lastNote ? (
          <Link href="/app/progress#coach-msg" className="card coach-card2" onClick={markSeen}>
            <span className="coach-head">
              <span className="z-av" aria-hidden="true">ز</span>
              <b>زهراء</b>
              {d.followup?.coach_replied_at ? <span className="coach-when">{timeAgo(d.followup.coach_replied_at)}</span> : null}
            </span>
            <p>{lastNote}</p>
          </Link>
        ) : null
      ) : (
        <section className="offer-card2">
          <b>تبين خطة على سعراتك؟</b>
          <p>المدربة زهراء تجهز لك وجباتك بالكميات على هدفك، وتتابعك كل أسبوع وترد عليك.</p>
          <a className="btn btn-p btn-sm" href={STORE_URL} target="_blank" rel="noreferrer">شوفي الخطط</a>
        </section>
      )}

      {new Date(today + "T12:00:00").getDay() === 5 ? <WeekSummary clientId={client.id} plans={acc.sub ? plans.filter((p) => !p.variant) : []} hide={hide} /> : null}

      {d.newPurchase ? (
        <section className="card row between wrap">
          <span className="row small"><CheckCircle2 size={20} color="var(--green)" />اشتريتي خطة جديدة؟</span>
          <Link className="btn btn-p btn-sm" href="/app/intake">عبي معلوماتها</Link>
        </section>
      ) : null}

      {share ? (
        <ShareSheet
          card={{ kind: "day", day: { cal: eaten.cal, target: d.target?.cal || null, p: eaten.p, c: eaten.c, f: eaten.f, water: d.water, waterGoal: cups, meals: plan ? { done: doneCount, total: todayMeals.length } : null, streak: d.streak, weight: lastWeight?.kg ?? null, workout: work ? trainedToday : null } }}
          onClose={() => setShare(false)}
        />
      ) : null}
    </>
  );
}

/** «خلصت الغداء» for the next meal's slot. */
function doneLabel(slot: string) {
  const w = slot.trim();
  return /\s/.test(w) ? "خلصتها" : `خلصت ${w.startsWith("ال") ? w : "ال" + w}`;
}

/** «أمس»، «قبل ساعتين»… */
function timeAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return m <= 1 ? "الحين" : `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "قبل ساعة" : h === 2 ? "قبل ساعتين" : `قبل ${h} ساعات`;
  const d = Math.round(h / 24);
  return d === 1 ? "أمس" : d === 2 ? "قبل يومين" : d <= 10 ? `قبل ${d} أيام` : `قبل ${d} يوم`;
}

/** The one alert: a small pill (dot, one line, orange link). Swipe it sideways to close. */
function AlertPill({ pill, onClose, hidden = false }: { pill: { key: string; text: string; link: string; href?: string; ext?: boolean; act?: () => void }; onClose: () => void; hidden?: boolean }) {
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const close = () => { try { sessionStorage.setItem(`zf-pill-${pill.key}`, "1"); } catch {} onClose(); };
  useEffect(() => {
    try { if (sessionStorage.getItem(`zf-pill-${pill.key}`) === "1") onClose(); } catch {}
  }, [pill.key, onClose]);
  const link = pill.href
    ? pill.ext
      ? <a className="pill-link" href={pill.href} target="_blank" rel="noreferrer" onClick={pill.act}>{pill.link}</a>
      : <Link className="pill-link" href={pill.href} onClick={pill.act}>{pill.link}</Link>
    : <button type="button" className="pill-link" onClick={pill.act}>{pill.link}</button>;
  if (hidden) return null;
  return (
    <div className="alert-pill" role="status" style={{ transform: `translateX(${dx}px)`, opacity: 1 - Math.min(1, Math.abs(dx) / 160) }}
      onPointerDown={(e) => { start.current = e.clientX; }}
      onPointerMove={(e) => { if (start.current !== null) setDx(e.clientX - start.current); }}
      onPointerUp={() => { if (Math.abs(dx) > 80) close(); else setDx(0); start.current = null; }}
      onPointerCancel={() => { setDx(0); start.current = null; }}>
      <i className="pill-dot" aria-hidden="true" />
      <span className="pill-text">{pill.text}</span>
      {link}
      <button type="button" className="pill-x" aria-label="إخفاء" onClick={close}><X size={13} /></button>
    </div>
  );
}
