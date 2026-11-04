import Link from "next/link";
import { CheckCircle2, ClipboardEdit, Clock3, PenLine, Sparkles } from "lucide-react";
import { deliveryWindow, formatDay } from "@/lib/business-days";
import { planTypeLabel } from "@/lib/intake";
import type { PlanRequest } from "@/lib/types";

const STEPS = ["وصلتنا معلوماتك", "المدربة تجهز خطتك", "خطتك جاهزة"];

export function RequestStatusCard({
  request,
  hasPlan,
  justSent
}: {
  request: PlanRequest | null;
  hasPlan: boolean;
  justSent: boolean;
}) {
  if (!request || request.status === "cancelled") {
    if (hasPlan) return null;
    return (
      <section className="panel reveal-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zahraa-coral/10 text-zahraa-coral">
            <ClipboardEdit size={22} />
          </div>
          <div>
            <h2 className="section-title">ابدئي من هنا: عبّي معلومات خطتك</h2>
            <p className="muted-text mt-1">تاخذ ٥ دقايق تقريبًا. بعدها تبدأ المدربة زهراء تجهز خطتك، وتوصلك خلال ٢-٣ أيام عمل.</p>
          </div>
        </div>
        <Link className="primary-button shrink-0" href="/client/intake">
          عبّي معلوماتي
        </Link>
      </section>
    );
  }

  if (request.status === "delivered") {
    return (
      <section className="panel reveal-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <h2 className="section-title">خطتك جاهزة</h2>
            <p className="muted-text mt-1">تلقينها تحت في "الخطة الحالية". وإذا اشتريتي خطة جديدة من المتجر، عبّي معلوماتها من هنا.</p>
          </div>
        </div>
        <Link className="secondary-button shrink-0" href="/client/intake">
          طلب خطة جديدة
        </Link>
      </section>
    );
  }

  const stage = request.status === "submitted" ? 0 : 1;
  const win = deliveryWindow(request.submitted_at);

  return (
    <section className="panel reveal-card p-6" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zahraa-coral/10 text-zahraa-coral">
          {justSent ? <Sparkles size={22} /> : <Clock3 size={22} />}
        </div>
        <div className="min-w-0">
          <h2 className="section-title">{justSent ? "وصلتنا معلوماتك، شكرًا لك" : stage === 0 ? "طلبك وصل" : "المدربة تجهز خطتك الحين"}</h2>
          <p className="muted-text mt-1">
            خطتك ({planTypeLabel(request)}) بتوصلك خلال ٢-٣ أيام عمل، بين <b className="text-zahraa-navy">{formatDay(win.from)}</b> و
            <b className="text-zahraa-navy"> {formatDay(win.to)}</b>. بنعلمك أول ما تجهز.
          </p>
        </div>
      </div>

      <ol className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-bold sm:text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-col items-center gap-2">
            <span className={`h-2 w-full rounded-full ${i <= stage ? "bg-zahraa-coral" : "bg-slate-200"}`} />
            <span className={i <= stage ? "text-zahraa-navy" : "text-slate-400"}>{label}</span>
          </li>
        ))}
      </ol>

      {request.status === "submitted" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link className="secondary-button" href={`/client/intake?edit=${request.id}`}>
            <PenLine size={17} />
            عدّلي معلوماتك
          </Link>
          <span className="text-xs text-slate-500">تقدرين تعدلين لين تبدأ المدربة على خطتك.</span>
        </div>
      ) : null}
    </section>
  );
}
