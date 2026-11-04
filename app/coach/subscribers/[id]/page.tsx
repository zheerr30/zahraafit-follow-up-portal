"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { CoachShell, Loading } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { planTypeLabel } from "@/lib/intake";
import { todayKey, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, Plan, PlanRequest, Profile } from "@/lib/types";

type Daily = { log_date: string; meals: Record<string, unknown>; water: number };
type WLog = { id: string; day_title: string | null; created_at: string; performed_on: string; duration_sec: number | null; items: { name: string; sets: { w: number; r: number }[] }[] };
type Body = { log_date: string; weight_kg: number | null; waist_cm: number | null; hips_cm: number | null };
type DayNote = { steps?: string; sleep?: string; notes?: string };

const short = (d: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00"));

function lastDays(n: number) {
  const out: string[] = [];
  const t = new Date(todayKey() + "T12:00:00");
  for (let i = 0; i < n; i++) {
    const d = new Date(t);
    d.setDate(t.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function SubscriberPage() {
  const auth = useAuthGuard("admin");
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [req, setReq] = useState<PlanRequest | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlanData | null>(null);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [wlogs, setWlogs] = useState<WLog[]>([]);
  const [body, setBody] = useState<Body[]>([]);
  const [checks, setChecks] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.profile || !params?.id) return;
    (async () => {
      const id = params.id;
      const { data: c } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (!c) return setLoading(false);
      setClient(c as Client);
      const since = lastDays(14)[13];
      const [p, r, pl, d, w, b, k] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", (c as Client).profile_id).maybeSingle(),
        supabase.from("plan_requests").select("*").eq("client_id", id).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("plans").select("*").eq("client_id", id).eq("is_current", true).eq("kind", "nutrition"),
        supabase.from("daily_logs").select("log_date, meals, water").eq("client_id", id).gte("log_date", since),
        supabase.from("workout_logs").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("body_logs").select("log_date, weight_kg, waist_cm, hips_cm").eq("client_id", id).order("log_date", { ascending: true }),
        supabase.from("challenge_checkins").select("id", { count: "exact", head: true }).eq("client_id", id)
      ]);
      setProfile((p.data as Profile | null) || null);
      setReq((r.data as PlanRequest | null) || null);
      const mp = ((pl.data as Plan[] | null) || []).find((x) => x.data);
      setMealPlan((mp?.data as MealPlanData | undefined) || null);
      setDaily((d.data as Daily[] | null) || []);
      setWlogs((w.data as WLog[] | null) || []);
      setBody((b.data as Body[] | null) || []);
      setChecks(k.count || 0);
      setLoading(false);
    })();
  }, [auth.profile, params?.id]);

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;
  if (!client) {
    return (
      <CoachShell>
        <p className="alert err">ما لقينا هالمشتركة.</p>
      </CoachShell>
    );
  }

  const perDay = mealPlan?.days[0]?.meals.length || 0;
  const days = lastDays(14);
  const byDate = new Map(daily.map((x) => [x.log_date, x]));
  const workoutDates = new Map<string, WLog>();
  wlogs.forEach((w) => workoutDates.set(w.performed_on || w.created_at.slice(0, 10), w));
  const eatenOf = (x?: Daily) => (x ? Object.entries(x.meals || {}).filter(([k, v]) => /^\d+-\d+$/.test(k) && v === true).length : 0);
  const week = days.slice(0, 7);
  const loggedDays = week.filter((d) => byDate.has(d)).length;
  const mealPct = perDay ? Math.round((week.reduce((a, d) => a + eatenOf(byDate.get(d)), 0) / (perDay * 7)) * 100) : null;
  const waterAvg = loggedDays ? Math.round((week.reduce((a, d) => a + (byDate.get(d)?.water || 0), 0) / loggedDays) * 10) / 10 : 0;
  const workoutsWeek = week.filter((d) => workoutDates.has(d)).length;
  const weights = body.filter((b) => b.weight_kg);
  const wFirst = weights[0], wLast = weights[weights.length - 1];
  const notes = days
    .map((d) => ({ d, n: (byDate.get(d)?.meals?._day as DayNote | undefined) || null }))
    .filter((x) => x.n && (x.n.notes || x.n.steps || x.n.sleep));

  return (
    <CoachShell>
      <Link className="link" href="/coach/subscribers">
        <ChevronRight />
        المشتركات
      </Link>
      <div className="row wrap" style={{ gap: 10 }}>
        <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>{(profile?.full_name || "؟").slice(0, 1)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 24 }}>{profile?.full_name || "مشتركة"}</h1>
          <div className="small muted">
            {[profile?.phone, req ? planTypeLabel(req) : null, `سجلت ${formatDate(client.created_at)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        {req ? <Link className="btn btn-g btn-sm" href={`/coach/requests/${req.id}`}>طلبها ومعلوماتها</Link> : null}
      </div>

      <div className="sec-title">
        <span className="em" aria-hidden="true">📊</span>
        <h2>آخر ٧ أيام</h2>
      </div>
      <div className="grid2">
        <div className="stat"><span>🍽️ الوجبات اللي أكلتها</span><b>{mealPct === null ? "—" : `${mealPct}%`}</b></div>
        <div className="stat"><span>💪 تمارين</span><b>{workoutsWeek}</b></div>
        <div className="stat"><span>💧 متوسط الماء</span><b>{waterAvg} <small style={{ fontSize: 13 }}>أكواب</small></b></div>
        <div className="stat"><span>📅 أيام سجلت فيها</span><b>{loggedDays} / 7</b></div>
      </div>

      <div className="sec-title">
        <span className="em" aria-hidden="true">🗓️</span>
        <h2>يوم بيوم</h2>
        <span className="aside">آخر ١٤ يوم</span>
      </div>
      <section className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="gtable" style={{ minWidth: 520 }}>
          <thead>
            <tr><th style={{ paddingInlineStart: 16 }}>اليوم</th><th>🍽️ وجبات</th><th>💧 ماء</th><th>👟 خطوات</th><th>😴 نوم</th><th>💪 تمرين</th></tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const x = byDate.get(d);
              const n = (x?.meals?._day as DayNote | undefined) || {};
              const w = workoutDates.get(d);
              const eaten = eatenOf(x);
              return (
                <tr key={d} style={{ opacity: x || w ? 1 : 0.45 }}>
                  <td style={{ paddingInlineStart: 16, whiteSpace: "nowrap" }}>{short(d)}</td>
                  <td>{x ? `${eaten}${perDay ? ` / ${perDay}` : ""}` : "—"}</td>
                  <td>{x?.water || "—"}</td>
                  <td>{n.steps || "—"}</td>
                  <td>{n.sleep || "—"}</td>
                  <td title={w?.day_title || undefined}>{w ? "✅" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {notes.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">💭</span>
            <h2>ملاحظاتها</h2>
          </div>
          <section className="card stack">
            {notes.map(({ d, n }) => (
              <div key={d} className="gitem">
                <b>{short(d)}</b>
                {n!.notes || ""}
                {n!.steps || n!.sleep ? <span className="note" style={{ display: "block" }}>{[n!.steps && `👟 ${n!.steps} خطوة`, n!.sleep && `😴 ${n!.sleep} ساعات`].filter(Boolean).join(" · ")}</span> : null}
              </div>
            ))}
          </section>
        </>
      ) : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">⚖️</span>
        <h2>الوزن والقياسات</h2>
      </div>
      <section className="card stack">
        {weights.length ? (
          <div className="row between wrap">
            <span><b style={{ fontSize: 26, color: "var(--navy)" }}>{wLast.weight_kg}</b> كجم <span className="note">آخر تسجيل {formatDate(wLast.log_date)}</span></span>
            {weights.length > 1 ? <span className="chip" dir="ltr">{Math.round((Number(wLast.weight_kg) - Number(wFirst.weight_kg)) * 10) / 10 > 0 ? "+" : ""}{Math.round((Number(wLast.weight_kg) - Number(wFirst.weight_kg)) * 10) / 10} كجم من {formatDate(wFirst.log_date)}</span> : null}
          </div>
        ) : (
          <p className="small muted">ما سجلت وزنها للحين.</p>
        )}
        {body.filter((b) => b.waist_cm).slice(-4).reverse().map((b) => (
          <div key={b.log_date} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="muted">{formatDate(b.log_date)}</span>
            <span>خصر {b.waist_cm} · أرداف {b.hips_cm} سم</span>
          </div>
        ))}
      </section>

      <div className="sec-title">
        <span className="em" aria-hidden="true">🏋️‍♀️</span>
        <h2>آخر التمارين</h2>
        {checks ? <span className="aside">🏆 {checks} يوم في التحديات</span> : null}
      </div>
      {wlogs.length ? (
        wlogs.slice(0, 6).map((w) => (
          <details key={w.id} className="gsec">
            <summary>
              <span className="em" aria-hidden="true">💪</span>
              <span>
                <b>{w.day_title || "تمرين"}</b>
                <span className="sub">{formatDate(w.created_at)}{w.duration_sec ? ` · ${Math.round(w.duration_sec / 60)} دقيقة` : ""}</span>
              </span>
            </summary>
            <div className="gbody">
              {w.items.map((it, i) => (
                <div key={i} className="row between small">
                  <span>{it.name}</span>
                  <span className="muted" dir="ltr">{it.sets.map((s) => (s.w ? `${s.w}×` : "") + s.r).join("  ")}</span>
                </div>
              ))}
            </div>
          </details>
        ))
      ) : (
        <p className="small muted">ما سجلت تمارين للحين.</p>
      )}
    </CoachShell>
  );
}
