"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CoachShell, Loading } from "@/components/ui";
import { COMMIT_LABEL, FEELINGS, dayName, followupInfo, type FollowupInfo } from "@/lib/followup";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, PlanRequest, Profile, WeeklyFollowup } from "@/lib/types";

type Row = { client: Client; name: string; info: FollowupInfo };

export default function CheckinsPage() {
  const auth = useAuthGuard("admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [fus, setFus] = useState<WeeklyFollowup[]>([]);
  const [needSetup, setNeedSetup] = useState<{ client: Client; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingDb, setMissingDb] = useState(false);

  useEffect(() => {
    if (!auth.profile) return;
    (async () => {
      const [{ data: c }, { data: p }, { data: f, error }, { data: r }] = await Promise.all([
        supabase.from("clients").select("*"),
        supabase.from("profiles").select("id, full_name").eq("role", "client"),
        supabase.from("weekly_followups").select("*").order("week_date", { ascending: false }).limit(300),
        supabase.from("plan_requests").select("client_id, wants_followup, status").eq("wants_followup", true).eq("status", "delivered")
      ]);
      if (error?.code === "42703") setMissingDb(true);
      const names = new Map(((p as Pick<Profile, "id" | "full_name">[] | null) || []).map((x) => [x.id, x.full_name]));
      const clients = (c as Client[] | null) || [];
      setRows(clients.map((x) => ({ client: x, name: names.get(x.profile_id) || "مشتركة", info: followupInfo(x) })));
      const wants = new Set(((r as Pick<PlanRequest, "client_id">[] | null) || []).map((x) => x.client_id));
      setNeedSetup(clients.filter((x) => !x.followup_start && wants.has(x.id)).map((x) => ({ client: x, name: names.get(x.profile_id) || "مشتركة" })));
      setFus((f as WeeklyFollowup[] | null) || []);
      setLoading(false);
    })();
  }, [auth.profile]);

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;

  const today = todayKey();
  const byClient = new Map(rows.map((r) => [r.client.id, r]));
  const waiting = fus.filter((f) => !f.coach_notes && byClient.has(f.client_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const answered = fus.filter((f) => f.coach_notes && byClient.has(f.client_id)).slice(0, 8);
  const late = rows.filter((r) => r.info.active && r.info.openDate && r.info.openDate <= today && !fus.some((f) => f.client_id === r.client.id && f.week_date === r.info.openDate));
  const ending = rows.filter((r) => (r.info.active && r.info.daysLeft <= 7) || (r.info.ended && r.info.daysLeft === 0 && new Date(r.info.end).getTime() > Date.now() - 14 * 864e5));
  const active = rows.filter((r) => r.info.active);

  const fRow = (f: WeeklyFollowup) => {
    const r = byClient.get(f.client_id)!;
    const wk = r.info.has ? Math.round((new Date(f.week_date).getTime() - new Date(r.info.start).getTime()) / (7 * 864e5)) : 0;
    return (
      <Link key={f.id} href={`/coach/checkins/${f.id}`} className="list-row">
        <span className="avatar" aria-hidden="true" style={{ fontSize: 22, background: "var(--sunken)" }}>{f.feeling ? FEELINGS[f.feeling - 1] : "📅"}</span>
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <b>{r.name}</b>
          <span className="small muted">{r.info.has ? `الأسبوع ${wk} من ${r.info.weeks}` : "📅 تسجيل السبت"} · {formatDate(f.created_at)}</span>
          <span className="small">
            {f.nutrition_commitment ? `🍽️ ${COMMIT_LABEL[f.nutrition_commitment - 1]}` : ""}{f.workout_commitment ? ` · 💪 ${COMMIT_LABEL[f.workout_commitment - 1]}` : ""}
            {f.changes_requested ? " · ✏️ طلبت تعديل" : ""}
          </span>
        </span>
      </Link>
    );
  };

  return (
    <CoachShell>
      <div className="row between wrap">
        <h1 style={{ fontSize: 24 }}>المتابعات</h1>
        <span className="chip">👥 {active.length} مشتركة في المتابعة</span>
      </div>
      {missingDb ? <p className="alert err">شغلي ملف phase7-weekly-followup.sql في Supabase عشان تشتغل المتابعات.</p> : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">💬</span>
        <h2>تنتظر ردك</h2>
        <span className="aside">{waiting.length}</span>
      </div>
      {waiting.length ? <div className="stack" style={{ gap: 10 }}>{waiting.map(fRow)}</div> : <p className="note">ما فيه متابعات تنتظر ردك 🎉</p>}

      {late.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">⏰</span>
            <h2>ما سلمت متابعة هالأسبوع</h2>
          </div>
          <section className="card" style={{ padding: "4px 16px" }}>
            {late.map((r) => (
              <Link key={r.client.id} href={`/coach/subscribers/${r.client.id}`} className="diary-row">
                <span><b>{r.name}</b><span className="note" style={{ display: "block" }}>كانت موعدها {dayName(r.info.openDate!)}</span></span>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {needSetup.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">⚙️</span>
            <h2>اشتركت بالمتابعة وما فعلتيها</h2>
          </div>
          <section className="card" style={{ padding: "4px 16px" }}>
            {needSetup.map((r) => (
              <Link key={r.client.id} href={`/coach/subscribers/${r.client.id}`} className="diary-row">
                <span><b>{r.name}</b><span className="note" style={{ display: "block" }}>حددي متى تبدأ متابعتها وكم أسبوع</span></span>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {ending.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">⌛</span>
            <h2>متابعتها تنتهي قريب</h2>
          </div>
          <section className="card" style={{ padding: "4px 16px" }}>
            {ending.map((r) => (
              <Link key={r.client.id} href={`/coach/subscribers/${r.client.id}`} className="diary-row">
                <span><b>{r.name}</b><span className="note" style={{ display: "block" }}>{r.info.active ? `باقي ${r.info.daysLeft} أيام · تنتهي ${formatDate(r.info.end)}` : `انتهت ${formatDate(r.info.end)}`}</span></span>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {answered.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">✅</span>
            <h2>رديتي عليها مؤخرًا</h2>
          </div>
          <div className="stack" style={{ gap: 10 }}>{answered.map(fRow)}</div>
        </>
      ) : null}
    </CoachShell>
  );
}
