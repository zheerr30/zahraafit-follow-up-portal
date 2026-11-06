"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardEdit, Clock3, Dumbbell, FileText, PenLine, Utensils } from "lucide-react";
import { HomeExtras } from "@/components/HomeExtras";
import { HomeToday } from "@/components/HomeToday";
import { WeekSummary } from "@/components/WeekSummary";
import { CheckinCard } from "@/components/CheckinCard";
import { ReminderNudge } from "@/components/ReminderNudge";
import { FreeHome, RenewBanner } from "@/components/FreeHome";
import { PeriodNote } from "@/components/PeriodTracker";
import { accountOf } from "@/lib/account";
import { useRouter } from "next/navigation";
import { ClientShell, Loading } from "@/components/ui";
import { deliveryWindow, formatDay } from "@/lib/business-days";
import { formatDate } from "@/lib/format";
import { planTypeLabel } from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, Plan, PlanRequest } from "@/lib/types";

const STAGES = ["وصلتنا معلوماتك", "المدربة تجهز خطتك", "خطتك جاهزة"];

function greeting() {
  return new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير";
}

export default function ClientHome() {
  const auth = useAuthGuard("client");
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [request, setRequest] = useState<PlanRequest | null>(null);
  const [plans, setPlans] = useState<(Plan & { url?: string })[]>([]);
  const [justSent, setJustSent] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!auth.profile) return;
      setJustSent(new URLSearchParams(window.location.search).get("sent") === "1");
      const { data: c } = await supabase.from("clients").select("*").eq("profile_id", auth.profile.id).maybeSingle();
      setClient((c as Client | null) || null);
      if (c) {
        const [{ data: r }, { data: p }] = await Promise.all([
          supabase.from("plan_requests").select("*").eq("client_id", c.id).neq("status", "cancelled").order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("plans").select("*").eq("client_id", c.id).eq("is_current", true).order("created_at", { ascending: true })
        ]);
        setRequest((r as PlanRequest | null) || null);
        const current = (p as Plan[] | null) || [];
        setPlans(
          await Promise.all(
            current.map(async (x) => {
              if (!x.file_path) return x;
              const { data: signed } = await supabase.storage.from("client-plans").createSignedUrl(x.file_path, 60 * 60);
              return { ...x, url: signed?.signedUrl };
            })
          )
        );
      }
      setLoading(false);
    }
    load();
  }, [auth.profile]);

  const plan = plans[0] || null;
  const acc = accountOf(auth.profile);
  // New accounts answer a few questions first (their daily target comes from them).
  const needsStart = Boolean(!loading && auth.profile && client && !request && !plan && (!client.age || !auth.profile.gender) && auth.profile.account_type !== undefined);
  useEffect(() => {
    if (needsStart) router.replace("/app/start");
  }, [needsStart, router]);

  if (auth.loading || loading || needsStart) return <Loading />;
  if (!auth.profile) return null;

  const firstName = (auth.profile.full_name || "").split(" ")[0];

  let main: React.ReactNode;
  if (!client) {
    main = <p className="alert err">حسابك ما انربط بملف مشتركة. تواصلي مع المدربة.</p>;
  } else if (!acc.sub) {
    main = (
      <>
        <RenewBanner daysLeft={null} expired={acc.expired} />
        <FreeHome clientId={client.id} />
      </>
    );
  } else if (!request && !plan) {
    main = (
      <section className="photo-hero">

        <span className="kicker">✨ أول خطوة</span>
        <h2>عبي معلومات خطتك عشان تبدأ المدربة زهراء تجهزها</h2>
        <p>تاخذ ٥ دقايق تقريبًا. وتوصلك خطتك خلال ٢-٣ أيام عمل.</p>
        <Link className="btn btn-p btn-block" href="/app/intake">
          <ClipboardEdit />
          عبي معلوماتي
        </Link>
      </section>
    );
  } else if (request && (request.status === "submitted" || request.status === "in_progress")) {
    const stage = request.status === "submitted" ? 0 : 1;
    const win = deliveryWindow(request.submitted_at);
    main = (
      <>
        <section className="photo-hero" aria-live="polite">

          <span className="kicker">{justSent ? "💌 وصلتنا معلوماتك، شكرًا لك" : `📋 ${planTypeLabel(request)}`}</span>
          <h2>{stage === 0 ? "خطتك بالطريق" : "المدربة تجهز خطتك الحين"}</h2>
          {Date.now() > win.to.getTime() + 864e5 / 2 ? (
            <p>تأخرت شوي عن موعدها. المدربة عليها وبتوصلك بأقرب وقت.</p>
          ) : (
            <p>
              توصلك خلال ٢-٣ أيام عمل، بين <b>{formatDay(win.from)}</b> و<b>{formatDay(win.to)}</b>. بنعلمك أول ما تجهز.
            </p>
          )}
        </section>
        <section className="card stack">
          <ol className="timeline">
            {STAGES.map((s, i) => (
              <li key={s} className={i <= stage ? "on" : undefined}>
                <i />
                {s}
              </li>
            ))}
          </ol>
          {request.status === "submitted" ? (
            <div className="row wrap">
              <Link className="btn btn-g btn-sm" href={`/app/intake?edit=${request.id}`}>
                <PenLine />
                عدلي معلوماتك
              </Link>
              <span className="note">تقدرين تعدلين لين تبدأ المدربة على خطتك.</span>
            </div>
          ) : (
            <p className="note">المدربة بدأت على خطتك، فما تقدرين تعدلين المعلومات الحين.</p>
          )}
        </section>
      </>
    );
  } else {
    main = (
      <>
        <section className="photo-hero">

          <span className="kicker">{plan ? `🎉 وصلتك ${formatDate(plan.created_at)}` : "🎉 خطتك"}</span>
          <h2>خطتك جاهزة</h2>
          {!plan ? <p>المدربة أرسلت خطتك. إذا ما وصلتك تواصلي معها.</p> : null}
          {plan?.content ? <p style={{ whiteSpace: "pre-line" }}>{plan.content}</p> : null}
          {plans.some((x) => x.kind === "nutrition" && x.data) ? (
            <Link className="btn btn-p btn-block" href="/app/food">
              <Utensils />
              وجباتي
            </Link>
          ) : null}
          {plans.some((x) => x.kind === "workout" && x.data) ? (
            <Link className="btn btn-p btn-block" href="/app/workout">
              <Dumbbell />
              تماريني
            </Link>
          ) : null}
          {plans.map((x) => {
            const isDoc = (x.data as { format?: string } | null)?.format === "zahraafit-doc";
            if (!x.url && !isDoc) return null;
            const label = `${x.title.replace(/\s*\(PDF\)$/, "")} (PDF)`;
            const cls = `btn btn-block ${plans.some((y) => y.kind !== "other" && y.data) ? "btn-on-navy" : "btn-p"}`;
            return x.url ? (
              <a key={x.id} className={cls} href={x.url} target="_blank" rel="noreferrer">
                <FileText />
                {label}
              </a>
            ) : (
              <Link key={x.id} className={cls} href={`/app/print/${x.id}`}>
                <FileText />
                {label}
              </Link>
            );
          })}
        </section>
        {client ? <CheckinCard client={client} saturday={acc.sub} /> : null}
        {client && plans.some((x) => x.kind !== "other" && x.data) ? <HomeToday clientId={client.id} plans={plans.filter((x) => !x.variant)} /> : null}
        {client && plans.length ? <ReminderNudge /> : null}
        {client ? <WeekSummary clientId={client.id} plans={plans} /> : null}
        <section className="card row between wrap">
          <span className="row small">
            <CheckCircle2 size={20} color="var(--green)" />
            اشتريتي خطة جديدة من المتجر؟
          </span>
          <Link className="btn btn-g btn-sm" href="/app/intake">
            عبي معلوماتها
          </Link>
        </section>
      </>
    );
  }

  return (
    <ClientShell title={`${greeting()}، ${firstName}`}>
      {acc.sub ? <RenewBanner daysLeft={acc.daysLeft} expired={false} /> : null}
      {client && auth.profile.gender !== "male" ? <PeriodNote clientId={client.id} /> : null}
      {main}
      {client ? <HomeExtras clientId={client.id} /> : null}
      {request || plan || !acc.sub ? null : (
        <div className="card row" style={{ alignItems: "flex-start" }}>
          <Clock3 size={20} color="var(--clay)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p className="small muted">
            جهزي رقم طلبك من سلة. تلقينه في رسالة تأكيد الطلب أو في <b>طلباتي</b> داخل المتجر.
          </p>
        </div>
      )}
    </ClientShell>
  );
}
