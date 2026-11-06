"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, X } from "lucide-react";
import { CalorieCard } from "@/components/CalorieCard";
import { streakDays } from "@/components/Achievements";
import { HomeRestaurants } from "@/components/HomeBoosts";
import { WeekSummary } from "@/components/WeekSummary";
import { STORE_URL, type Account } from "@/lib/account";
import { addDays, followupInfo } from "@/lib/followup";
import { resolve, tickedMeals, type MealRef } from "@/lib/meal-resolve";
import { currentPeriod, type PeriodLog } from "@/lib/period";
import { todayKey, waterCups, type MealPlanData, type WorkoutPlanData } from "@/lib/plan-data";
import { isRamadanMonth, ramadanActive, ramadanMealSlot, ramadanUntil } from "@/lib/ramadan";
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

  const mealRow = plans.find((p) => p.kind === "nutrition" && p.data && !p.variant) || null;
  const plan = acc.sub ? ((mealRow?.data as MealPlanData | undefined) || null) : null;
  const workRow = plans.find((p) => p.kind === "workout" && p.data && !p.variant) || null;
  const work = acc.sub ? ((workRow?.data as WorkoutPlanData | undefined) || null) : null;

  const load = useCallback(async () => {
    const weekAgo = addDays(today, -7);
    const [dl, fe, tg, ch, wl, bl, fu, pl, rp, np, streak] = await Promise.all([
      supabase.from("daily_logs").select("meals, water").eq("client_id", client.id).eq("log_date", today).maybeSingle(),
      supabase.from("food_entries").select("cal, p, c, f").eq("client_id", client.id).eq("log_date", today),
      plan?.target.cal ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal, p, c, f").eq("client_id", client.id).maybeSingle(),
      mealRow && plan ? supabase.from("plan_choices").select("data").eq("plan_id", mealRow.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("workout_logs").select("performed_on, day_index, plan_id").eq("client_id", client.id).gte("performed_on", weekAgo).order("created_at", { ascending: false }),
      supabase.from("body_logs").select("log_date, weight_kg").eq("client_id", client.id).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("weekly_followups").select("id, week_date, coach_notes, coach_replied_at").eq("client_id", client.id).order("week_date", { ascending: false }).limit(1).maybeSingle(),
      profile.gender === "male" ? Promise.resolve({ data: [] }) : supabase.from("period_logs").select("*").eq("client_id", client.id).order("start_date", { ascending: false }).limit(2),
      supabase.from("reminder_prefs").select("ramadan_until").eq("profile_id", profile.id).maybeSingle(),
      supabase.rpc("my_new_purchase"),
      streakDays(client.id)
    ]);
    const food = { cal: 0, p: 0, c: 0, f: 0 };
    ((fe.data as { cal: number; p: number; c: number; f: number }[] | null) || []).forEach((x) => {
      food.cal += Number(x.cal); food.p += Number(x.p); food.c += Number(x.c); food.f += Number(x.f);
    });
    const b = bl.data as { log_date: string; weight_kg: number } | null;
    setD({
      meals: ((dl.data as { meals?: Record<string, unknown> } | null)?.meals) || {},
      water: (dl.data as { water?: number } | null)?.water || 0,
      food,
      target: plan?.target.cal ? plan.target : ((tg.data as Data["target"]) || null),
      swaps: ((ch.data as { data?: { meals?: Record<string, MealRef> } } | null)?.data?.meals) || {},
      workouts: (wl.data as Data["workouts"] | null) || [],
      weight: b ? { kg: Number(b.weight_kg), date: b.log_date } : null,
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
  if (left !== null && left < -40) line = <>📊 زدتي <b>{-left}</b> سعرة عن هدفك اليوم. عادي يصير، بكرا يوم جديد 💪</>;
  else if (next) line = <Link href="/app/food" className="cal-line-btn">{doneCount ? "👏 الوجبة الجاية" : "🍽️ ابدئي يومك بـ"}: <b>{next.slot}</b> · {next.meal.name}</Link>;
  else if (plan && left !== null && left > 40) line = <Link href="/app/food" className="cal-line-btn">✅ خلصتي وجبات اليوم! باقي لك <b>{left}</b> سعرة، اختاري من «🍎 سناكات مقترحة»</Link>;
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
  const ramadanSuggest = isRamadanMonth(today) && !ramadan;
  let alert: ReactNode = null;
  if (acc.sub && acc.daysLeft !== null && acc.daysLeft <= 5) {
    alert = <div className="alert-card warn"><b>⏳ {acc.daysLeft <= 0 ? "اشتراكك ينتهي اليوم" : `باقي ${acc.daysLeft} أيام على نهاية اشتراكك`}</b><span>جددي عشان ما توقف خطتك ومتابعتك.</span><a className="btn btn-p btn-sm" href={STORE_URL} target="_blank" rel="noreferrer">جددي اشتراكك</a></div>;
  } else if (!acc.sub && acc.expired) {
    alert = <div className="alert-card"><b>⏳ انتهى اشتراكك</b><span>بياناتك وسجلك محفوظين. جددي عشان تفتح خطتك وتمارينك.</span><a className="btn btn-p btn-sm" href={STORE_URL} target="_blank" rel="noreferrer">جددي اشتراكك</a></div>;
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
  } else if (period) {
    alert = <div className="alert-card pink"><b>🌸 أيام الدورة</b><span>لو زاد وزنك أو حسيتي بانتفاخ هالأيام، هذا طبيعي ومؤقت (احتباس ماء). كملي على خطتك 💛</span></div>;
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
    await supabase.from("daily_logs").upsert({ client_id: client.id, log_date: today, meals: d!.meals, water: w }, { onConflict: "client_id,log_date" });
  }
  const trainedToday = d.workouts.some((w) => w.performed_on === today);
  const weekDays = new Set(d.workouts.map((w) => w.performed_on)).size;
  const lastW = d.workouts[0];
  const nextWorkout = work ? work.days[lastW && lastW.plan_id === workRow?.id ? (lastW.day_index + 1) % work.days.length : 0]?.title : null;
  const workCard = !acc.sub
    ? { href: "/app/workout", label: "💪 تمرين اليوم", value: "جدول على هدفك", sub: "شوفي وش يحصلك" }
    : !work
      ? { href: "/app/workout", label: "💪 تمرين اليوم", value: "جدولك قريب", sub: "يطلع هنا أول ما يوصل" }
      : trainedToday
        ? { href: "/app/workout", label: "💪 تمرين اليوم", value: "✅ تمرنتي", sub: "عافية عليك!" }
        : weekDays >= work.days.length
          ? { href: "/app/workout", label: "💪 تمرين اليوم", value: "يوم راحة 😌", sub: `خلصتي ${weekDays} تمارين هالأسبوع` }
          : { href: "/app/workout", label: "💪 تمرين اليوم", value: nextWorkout || "—", sub: "اضغطي وابدئي" };
  const weightFresh = d.weight && d.weight.date >= addDays(today, -6);
  const cups = waterCups(d.weight?.kg);

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
      </div>
      <div className="day-grid">
        <Link href="/app/food" className="today-card">
          <span className="label">🍽️ أكل اليوم</span>
          {plan ? <b className="num">{doneCount} <small>من {todayMeals.length} وجبات</small></b> : <b className="num">{Math.round(eaten.cal)} <small>سعرة</small></b>}
          <span className="note">{plan ? (next ? `الجاية: ${next.slot}` : "خلصتي وجباتك 👏") : left !== null ? `باقي ${Math.max(0, left)} سعرة` : "سجلي أكلك"}</span>
        </Link>
        <div className="today-card water-card">
          <button type="button" className="water-main" onClick={() => addWater(1)} aria-label={`أضيفي كوب ماء، شربتي ${d.water} من ${cups}`}>
            <span className="label">💧 الماء</span>
            <b className="num">{d.water} <small>من {cups} أكواب</small></b>
            <span className="cups-mini" aria-hidden="true">{Array.from({ length: cups }, (_, i) => <i key={i} className={i < d.water ? "on" : ""} />)}</span>
            <span className="note">اضغطي = كوب ✚</span>
          </button>
          {d.water ? <button type="button" className="water-undo" aria-label="شيلي كوب" onClick={() => addWater(-1)}>−</button> : null}
        </div>
        <Link href={workCard.href} className="today-card">
          <span className="label">{workCard.label}</span>
          <b className="trunc">{workCard.value}</b>
          <span className="note">{workCard.sub}</span>
        </Link>
        <Link href="/app/progress" className="today-card">
          <span className="label">⚖️ وزنك</span>
          {weightFresh ? <b className="num">{d.weight!.kg} <small>كجم</small></b> : <b>سجلي وزنك</b>}
          <span className="note">{weightFresh ? "آخر وزن" : d.weight ? `آخر مرة ${d.weight.kg} كجم` : "مرة بالأسبوع تكفي"}</span>
        </Link>
        <div className="today-card streak-card">
          <span aria-hidden="true" className="streak-em">🔥</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            {d.streak > 0 ? <b><span className="num">{d.streak}</span> {d.streak === 1 ? "يوم" : "أيام"} ورا بعض</b> : <b>ابدئي سلسلتك اليوم</b>}
            <span className="note" style={{ display: "block" }}>{d.streak > 0 ? "سجلتي أكلك أو خلصتي وجباتك. كملي!" : "سجلي أكلك أو علمي على وجباتك ويبدأ العداد."}</span>
          </span>
        </div>
      </div>

      {left !== null && left > 0 ? <HomeRestaurants clientId={client.id} left={left} onAdded={load} /> : null}

      {d.newPurchase ? (
        <section className="card row between wrap">
          <span className="row small"><CheckCircle2 size={20} color="var(--green)" />اشتريتي خطة جديدة؟</span>
          <Link className="btn btn-p btn-sm" href="/app/intake">عبي معلوماتها</Link>
        </section>
      ) : null}

      {new Date(today + "T12:00:00").getDay() === 5 ? <WeekSummary clientId={client.id} plans={acc.sub ? plans.filter((p) => !p.variant) : []} /> : null}
    </>
  );
}
