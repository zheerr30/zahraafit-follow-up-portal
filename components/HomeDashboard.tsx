"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, Dumbbell, Flame, Plus, Share2, Utensils, X } from "lucide-react";
import { ShareSheet } from "@/components/ShareSheet";
import { CalorieCard } from "@/components/CalorieCard";
import { streakDays } from "@/components/Achievements";
import { HomeRestaurants } from "@/components/HomeBoosts";
import { WeekSummary } from "@/components/WeekSummary";
import { STORE_URL, type Account } from "@/lib/account";
import { addDays, followupInfo } from "@/lib/followup";
import { resolve, tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { currentPeriod, inPeriod, type PeriodLog } from "@/lib/period";
import { todayKey, waterCups, type MealPlanData, type WorkoutPlanData } from "@/lib/plan-data";
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
};

const SEEN_KEY = "zf-seen-reply";
export const markReplySeen = (id: string) => {
  try { localStorage.setItem(SEEN_KEY, id); } catch {}
};
const seenReply = () => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
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
  const [share, setShare] = useState(false);

  const mealRow = plans.find((p) => p.kind === "nutrition" && p.data && !p.variant) || null;
  const plan = acc.sub ? ((mealRow?.data as MealPlanData | undefined) || null) : null;
  const workRow = plans.find((p) => p.kind === "workout" && p.data && !p.variant) || null;
  const work = acc.sub ? ((workRow?.data as WorkoutPlanData | undefined) || null) : null;

  const load = useCallback(async () => {
    const weekAgo = addDays(today, -7);
    const [dl, fe, tg, ch, wl, bl, fu, pl, rp, np, streak, wk, wf] = await Promise.all([
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
      supabase.from("food_entries").select("log_date").eq("client_id", client.id).gte("log_date", addDays(today, -6))
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
      newPurchase: np.data === true
    });
  }, [client.id, profile.id, profile.gender, today, plan, mealRow]);

  useEffect(() => {
    load();
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

  let line: ReactNode;
  const remaining = todayMeals.filter((x) => d.meals[x.key] !== true);
  if (left !== null && left < -40) line = <>📊 زدتي <b>{-left}</b> سعرة عن هدفك اليوم. عادي يصير، بكرا يوم جديد 💪</>;
  else if (next && remaining.length === 1 && doneCount) line = <Link href="/app/food" className="cal-line-btn">💪 باقي وجبة وحدة: <b>{next.slot}</b> · {next.meal.name}</Link>;
  else if (next) line = <Link href="/app/food" className="cal-line-btn">{doneCount ? "👏 الوجبة الجاية" : "🍽️ ابدئي يومك بـ"}: <b>{next.slot}</b> · {next.meal.name}</Link>;
  else if (plan && left !== null && left > 40) line = <Link href="/app/food" className="cal-line-btn">✅ خلصتي وجبات اليوم! باقي لك <b>{left}</b> سعرة مفتوحة، اختاري من «🍎 سناكات مقترحة»</Link>;
  else if (plan) line = <>✅ خلصتي وجبات اليوم وضبطتي هدفك 👏</>;
  else if (!eaten.cal) line = <Link href="/app/food" className="cal-line-btn">👆 سجلي أول شي أكلتيه اليوم</Link>;
  else if (left !== null) line = <>👍 باقي لك <b>{left}</b> سعرة اليوم.</>;

  // ── one alert, by priority ──
  const fu = followupInfo(client, today, acc.sub);
  let replyAlert = false;
  const markSeen = () => { if (d.followup) markReplySeen(d.followup.id); };
  const reply = d.followup?.coach_notes && d.followup.coach_replied_at && Date.now() - new Date(d.followup.coach_replied_at).getTime() < 7 * 864e5 && seenReply() !== d.followup.id ? d.followup : null;
  const checkinDue = fu.openDate && d.followup?.week_date !== fu.openDate;
  const period = profile.gender !== "male" && currentPeriod(d.periods, today);
  const ramadanSuggest = isRamadanMonth(today) && hijri(today).d <= 2 && !ramadan;
  let alert: ReactNode = null;
  if (acc.sub && acc.daysLeft !== null && acc.daysLeft <= 5) {
    alert = <div className="alert-card warn"><b>⏳ {acc.daysLeft <= 0 ? "اشتراكك ينتهي اليوم" : `باقي ${acc.daysLeft} أيام على نهاية اشتراكك`}</b><span>جددي عشان ما توقف خطتك ومتابعتك.</span><a className="btn btn-p btn-sm" href={STORE_URL} target="_blank" rel="noreferrer">جددي اشتراكك</a></div>;
  } else if (!acc.sub && acc.expired) {
    alert = <div className="alert-card warn"><b>⏳ انتهى اشتراكك</b><span>بياناتك وسجلك محفوظين. جددي عشان تفتح خطتك وتمارينك.</span><a className="btn btn-p btn-sm" href={STORE_URL} target="_blank" rel="noreferrer">جددي اشتراكك</a></div>;
  } else if (reply) {
    replyAlert = true;
    alert = (
      <div className="alert-card coach-note">
        <span className="coach-av" aria-hidden="true"><img src="/brand/logo-mark.png" alt="" /></span>
        <span className="coach-note-t">
          <b>رسالة جديدة من زهراء</b>
          <span className="one-line">{reply.coach_notes}</span>
          <Link href="/app/progress#coach-msg" className="link" onClick={markSeen}>اقرئي الرسالة</Link>
        </span>
      </div>
    );
  } else if (checkinDue) {
    alert = <Link href="/app/checkin" className="alert-card"><b>📅 {fu.saturday ? "اليوم السبت! وقت تسجيلك الأسبوعي" : "وقت متابعتك الأسبوعية"}</b><span>سجلي وزنك وقياساتك وكيف كان أسبوعك.</span></Link>;
  } else if (!acc.sub && new Date(today + "T12:00:00").getDay() === 6 && !(d.weight && d.weight.date >= addDays(today, -6))) {
    alert = <Link href="/app/progress" className="alert-card"><b>📅 اليوم السبت! وقت وزنك الأسبوعي</b><span>سجلي وزنك وتابعي تغيره أسبوع بأسبوع.</span></Link>;
  } else if (ramadanSuggest) {
    alert = (
      <div className="alert-card">
        <b>🌙 رمضان كريم! نشغل وضع رمضان؟</b>
        <span>وجباتك تصير فطور ووجبة بينية وسحور، وتذكير الماء بين المغرب والفجر.</span>
        <button type="button" className="btn btn-p btn-sm" onClick={async () => {
          await supabase.from("reminder_prefs").upsert({ profile_id: profile.id, ramadan_until: ramadanUntil() }, { onConflict: "profile_id" });
          window.location.reload();
        }}>شغليه</button>
      </div>
    );
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
  const nextWorkout = work ? work.days[lastW && lastW.plan_id === workRow?.id ? (lastW.day_index + 1) % work.days.length : 0]?.title : null;
  const workValue = !work ? null : trainedToday ? "✅ تمرنتي اليوم" : weekDays >= work.days.length ? "يوم راحة 😌" : nextWorkout || "—";
  const workSub = !work ? "" : trainedToday ? "عافية عليك!" : weekDays >= work.days.length ? `خلصتي ${weekDays} تمارين هالأسبوع` : "تمرين اليوم";
  const cups = waterCups(d.weight?.kg);
  const lastWeight = d.weight;
  const week7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const DAY_L = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

  return (
    <>
      {alert && !dismissed ? (
        <div className="alert-wrap">
          {alert}
          <button type="button" className="alert-x" aria-label="إخفاء" onClick={() => { if (replyAlert) markSeen(); setDismissed(true); }}><X size={14} /></button>
        </div>
      ) : null}

      {readyHero || (
        <CalorieCard totals={eaten} target={d.target} header={
          <div className="row between" style={{ alignItems: "center" }}>
            <h2>🔥 سعراتك اليوم</h2>
            <Link href="/app/food" className="cal-chip" style={{ color: "#fff", background: "rgba(255,255,255,.12)" }}>{todayMeals.length ? `✅ ${doneCount} من ${todayMeals.length} وجبات` : "أكلي"} ‹</Link>
          </div>
        } line={line} />
      )}
      {!acc.sub ? (
        <a className="offer-link" href={STORE_URL} target="_blank" rel="noreferrer">🍽️ تبين خطة جاهزة على سعراتك؟ <ChevronLeft size={16} /></a>
      ) : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">☀️</span>
        <h2>يومك</h2>
        <button type="button" className="share-btn" style={{ margin: 0, marginInlineStart: "auto" }} onClick={() => setShare(true)}><Share2 size={14} /> شاركي</button>
      </div>
      <section className="card day-rows">
        <Link href="/app/food" className="d-row">
          <span className="d-ic" style={{ background: "var(--clay-tint)", color: "var(--clay)" }}><Utensils size={18} /></span>
          <span className="d-mid">
            <small>الأكل</small>
            {plan ? <b className="num">{doneCount} من {todayMeals.length} وجبات</b> : <b className="num">{Math.round(eaten.cal)} {d.target ? <>من {d.target.cal} </> : null}سعرة</b>}
            {plan ? (
              <span className="seg-bar" aria-hidden="true">{todayMeals.map((x) => <i key={x.key} className={d.meals[x.key] === true ? "on" : ""} />)}</span>
            ) : d.target ? (
              <span className="seg-bar" aria-hidden="true"><i className="on" style={{ flex: "none", width: `${Math.min(100, (eaten.cal / d.target.cal) * 100)}%` }} /></span>
            ) : null}
          </span>
          <span className="d-end">{plan ? (next ? `باقي ${/^ال|\s/.test(next.slot) ? next.slot : "ال" + next.slot}` : "✓ خلصت") : left !== null ? (left >= 0 ? `باقي ${left}` : `زيادة ${-left}`) : "سجلي"}</span>
        </Link>
        <div className="d-row">
          <Link href="/app/food" className="d-link">
            <span className="d-ic" style={{ background: "#E6F0FD", color: "#2F7DE1" }}>💧</span>
            <span className="d-mid">
              <small>الماء</small>
              <b className="num">{d.water} من {cups} أكواب</b>
              <span className="dots" aria-hidden="true">{Array.from({ length: cups }, (_, i) => <i key={i} className={i < d.water ? "on" : ""} />)}</span>
            </span>
          </Link>
          <button type="button" className="d-plus" aria-label={`أضيفي كوب ماء، شربتي ${d.water} من ${cups}`} onClick={() => addWater(1)}><Plus size={20} /></button>
        </div>
        {work ? (
          <Link href="/app/workout" className="d-row">
            <span className="d-ic" style={{ background: "var(--green-tint)", color: "var(--green)" }}><Dumbbell size={18} /></span>
            <span className="d-mid">
              <small>{workSub}</small>
              <b className="trunc">{workValue}</b>
            </span>
            <span className="d-end"><ChevronLeft size={16} /></span>
          </Link>
        ) : null}
        <Link href="/app/progress" className="d-row">
          <span className="d-ic" style={{ background: "var(--clay-tint)", color: "var(--clay)" }}><Flame size={18} /></span>
          <span className="d-mid">
            <small>الالتزام</small>
            {d.streak > 0 ? <b><span className="num">{d.streak}</span> {d.streak === 1 ? "يوم" : d.streak === 2 ? "يومين" : "أيام"} ورا بعض</b> : <b>ابدئي سلسلتك اليوم</b>}
            <span className="wk-circles" aria-label={`سجلتي ${week7.filter((k) => d.weekOn.has(k)).length} من آخر 7 أيام`}>
              {week7.map((k) => <i key={k} className={`${d.weekOn.has(k) ? "on" : ""} ${k === today ? "now" : ""}`}>{DAY_L[new Date(k + "T12:00:00").getDay()]}</i>)}
            </span>
          </span>
        </Link>
      </section>

      {left !== null && left > 0 ? <HomeRestaurants clientId={client.id} left={left} onAdded={load} /> : null}

      {new Date(today + "T12:00:00").getDay() === 5 ? <WeekSummary clientId={client.id} plans={acc.sub ? plans.filter((p) => !p.variant) : []} /> : null}

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
