"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardEdit, Clock3, FileText, PenLine } from "lucide-react";
import { ClientShell, Loading, Rings } from "@/components/ui";
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
  const [client, setClient] = useState<Client | null>(null);
  const [request, setRequest] = useState<PlanRequest | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>(null);
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
          supabase.from("plans").select("*").eq("client_id", c.id).eq("is_current", true).order("created_at", { ascending: false }).limit(1).maybeSingle()
        ]);
        setRequest((r as PlanRequest | null) || null);
        const currentPlan = (p as Plan | null) || null;
        setPlan(currentPlan);
        if (currentPlan?.file_path) {
          const { data: signed } = await supabase.storage.from("client-plans").createSignedUrl(currentPlan.file_path, 60 * 60);
          setPlanUrl(signed?.signedUrl || null);
        }
      }
      setLoading(false);
    }
    load();
  }, [auth.profile]);

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;

  const firstName = (auth.profile.full_name || "").split(" ")[0];

  let main: React.ReactNode;
  if (!client) {
    main = <p className="alert err">حسابك ما انربط بملف مشتركة. تواصلي مع المدربة.</p>;
  } else if (!request && !plan) {
    main = (
      <section className="hero">
        <Rings />
        <span className="label">أول خطوة</span>
        <h2>عبّي معلومات خطتك عشان تبدأ المدربة زهراء تجهزها</h2>
        <p>تاخذ ٥ دقايق تقريبًا. وتوصلك خطتك خلال ٢-٣ أيام عمل.</p>
        <Link className="btn btn-p btn-block" href="/app/intake">
          <ClipboardEdit />
          عبّي معلوماتي
        </Link>
      </section>
    );
  } else if (request && (request.status === "submitted" || request.status === "in_progress")) {
    const stage = request.status === "submitted" ? 0 : 1;
    const win = deliveryWindow(request.submitted_at);
    main = (
      <>
        <section className="hero" aria-live="polite">
          <Rings />
          <span className="label">{justSent ? "وصلتنا معلوماتك، شكرًا لك" : planTypeLabel(request)}</span>
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
                عدّلي معلوماتك
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
        <section className="hero">
          <Rings />
          <span className="label">{plan ? `أضيفت ${formatDate(plan.created_at)}` : "خطتك"}</span>
          <h2>{plan ? plan.title : "خطتك جاهزة"}</h2>
          {!plan ? <p>المدربة أرسلت خطتك. إذا ما وصلتك تواصلي معها.</p> : null}
          {plan?.content ? <p style={{ whiteSpace: "pre-line" }}>{plan.content}</p> : null}
          {planUrl ? (
            <a className="btn btn-p btn-block" href={planUrl} target="_blank" rel="noreferrer">
              <FileText />
              افتحي خطتك
            </a>
          ) : null}
        </section>
        <section className="card row between wrap">
          <span className="row small">
            <CheckCircle2 size={20} color="var(--green)" />
            اشتريتي خطة جديدة من المتجر؟
          </span>
          <Link className="btn btn-g btn-sm" href="/app/intake">
            عبّي معلوماتها
          </Link>
        </section>
      </>
    );
  }

  return (
    <ClientShell title={`${greeting()}، ${firstName}`}>
      {main}
      {request || plan ? null : (
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
