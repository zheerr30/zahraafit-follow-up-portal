"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Send } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/Feedback";
import {
  EXCLUDED_OPTIONS,
  GENDERS,
  GOALS,
  HEALTH_OPTIONS,
  INJURY_OPTIONS,
  LEVELS,
  PLACES,
  SOURCE_OPTIONS,
  emptyAnswers,
  normalizeAnswers,
  parseNumber,
  type IntakeAnswers
} from "@/lib/intake";
import { safeFileName } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, PlanRequest } from "@/lib/types";

type StepKey = "order" | "basics" | "goal" | "nutrition" | "workout" | "final";

type Draft = {
  orderNumber: string;
  wantsNutrition: boolean;
  wantsWorkout: boolean;
  wantsFollowup: boolean;
  answers: IntakeAnswers;
  numbers: { age: string; height: string; weight: string };
};

const STEP_TITLES: Record<StepKey, string> = {
  order: "طلبك",
  basics: "معلوماتك",
  goal: "هدفك وصحتك",
  nutrition: "الأكل",
  workout: "التمرين",
  final: "آخر خطوة"
};

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-4 text-sm font-bold transition ${
        on ? "border-zahraa-coral bg-zahraa-coral/10 text-zahraa-coral" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {on ? <Check className="-mt-0.5 me-1 inline" size={15} /> : null}
      {label}
    </button>
  );
}

function Option({ on, title, sub, onClick }: { on: boolean; title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-2 p-4 text-right transition ${
        on ? "border-zahraa-coral bg-zahraa-coral/5" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${on ? "border-[6px] border-zahraa-coral" : "border-slate-300"}`} />
      <span>
        <span className="block font-black text-zahraa-navy">{title}</span>
        {sub ? <span className="mt-0.5 block text-sm text-slate-500">{sub}</span> : null}
      </span>
    </button>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function IntakePage() {
  const auth = useAuthGuard("client");
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState<PlanRequest | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [inbodyFile, setInbodyFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const draftKey = auth.profile ? `zf-intake-draft-${auth.profile.id}` : null;

  useEffect(() => {
    async function load() {
      if (!auth.profile) return;
      const editId = new URLSearchParams(window.location.search).get("edit");

      const { data: clientData } = await supabase.from("clients").select("*").eq("profile_id", auth.profile.id).maybeSingle();
      if (!clientData) {
        setBlocked("لم يتم ربط حسابك بملف مشتركة بعد. تواصلي مع المدربة.");
        setLoading(false);
        return;
      }
      setClient(clientData as Client);

      const { data: requests } = await supabase
        .from("plan_requests")
        .select("*")
        .eq("profile_id", auth.profile.id)
        .order("submitted_at", { ascending: false });
      const list = (requests as PlanRequest[] | null) || [];

      if (editId) {
        const req = list.find((r) => r.id === editId);
        if (!req) {
          setBlocked("ما لقينا هذا الطلب.");
        } else if (req.status !== "submitted") {
          setBlocked("المدربة بدأت تجهز خطتك، فما تقدرين تعدلين المعلومات الحين. إذا فيه شي مهم تواصلي معها.");
        } else {
          const a = normalizeAnswers(req.answers);
          setEditing(req);
          setDraft({
            orderNumber: req.order_number,
            wantsNutrition: req.wants_nutrition,
            wantsWorkout: req.wants_workout,
            wantsFollowup: req.wants_followup,
            answers: a,
            numbers: { age: a.age?.toString() || "", height: a.height_cm?.toString() || "", weight: a.weight_kg?.toString() || "" }
          });
        }
        setLoading(false);
        return;
      }

      const open = list.find((r) => r.status === "submitted" || r.status === "in_progress");
      if (open) {
        setBlocked("عندك طلب ما خلص للحين. تقدرين تشوفينه من لوحتك.");
        setLoading(false);
        return;
      }

      // Resume an unsent draft, else start from her last answers (returning subscriber), else from her profile.
      let saved: Draft | null = null;
      try {
        const raw = localStorage.getItem(`zf-intake-draft-${auth.profile.id}`);
        if (raw) saved = JSON.parse(raw) as Draft;
      } catch {}
      if (saved) {
        setDraft({ ...saved, answers: normalizeAnswers(saved.answers) });
      } else {
        const prev = list[0] ? normalizeAnswers(list[0].answers) : emptyAnswers();
        const a: IntakeAnswers = {
          ...prev,
          full_name: prev.full_name || auth.profile.full_name || "",
          phone: prev.phone || auth.profile.phone || "",
          consent: false
        };
        setDraft({
          orderNumber: "",
          wantsNutrition: false,
          wantsWorkout: false,
          wantsFollowup: false,
          answers: a,
          numbers: { age: a.age?.toString() || "", height: a.height_cm?.toString() || "", weight: a.weight_kg?.toString() || "" }
        });
      }
      setLoading(false);
    }
    load();
  }, [auth.profile]);

  // Keep an unsent new request in this browser so she can come back to it.
  useEffect(() => {
    if (!draft || editing || !draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {}
  }, [draft, editing, draftKey]);

  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = ["order", "basics", "goal"];
    if (draft?.wantsNutrition) s.push("nutrition");
    if (draft?.wantsWorkout) s.push("workout");
    s.push("final");
    return s;
  }, [draft?.wantsNutrition, draft?.wantsWorkout]);

  if (auth.loading || loading) return <LoadingState />;
  if (!auth.profile) return null;

  const shell = (body: React.ReactNode) => (
    <main className="page-shell">
      <div className="mx-auto w-full max-w-2xl">
        <AppHeader profile={auth.profile!} title={editing ? "تعديل معلوماتك" : "معلومات خطتك"} />
        {body}
      </div>
    </main>
  );

  if (blocked || !draft) {
    return shell(
      <div className="space-y-4">
        <ErrorState message={blocked || "تعذر تحميل النموذج."} />
        <Link className="secondary-button" href="/client/dashboard">
          رجوع للوحتي
        </Link>
      </div>
    );
  }

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const a = draft.answers;
  const setA = (patch: Partial<IntakeAnswers>) => setDraft({ ...draft, answers: { ...a, ...patch } });
  const setN = (patch: Partial<IntakeAnswers["nutrition"]>) => setA({ nutrition: { ...a.nutrition, ...patch } });
  const setW = (patch: Partial<IntakeAnswers["workout"]>) => setA({ workout: { ...a.workout, ...patch } });

  function check(s: StepKey): string | null {
    const d = draft!;
    if (s === "order") {
      if (d.orderNumber.trim().length < 3) return "اكتبي رقم طلبك من سلة. تلقينه في رسالة تأكيد الطلب.";
      if (!d.wantsNutrition && !d.wantsWorkout && !d.wantsFollowup) return "اختاري وش اشتريتي: غذائي، رياضي، أو متابعة.";
    }
    if (s === "basics") {
      if (!a.full_name.trim()) return "اكتبي اسمك.";
      if (a.phone.replace(/[^\d٠-٩]/g, "").length < 9) return "اكتبي رقم جوالك.";
      const age = parseNumber(d.numbers.age), h = parseNumber(d.numbers.height), w = parseNumber(d.numbers.weight);
      if (!age || age < 12 || age > 80) return "اكتبي عمرك بالأرقام، مثلًا 27.";
      if (!a.gender) return "اختاري الجنس.";
      if (!h || h < 120 || h > 220) return "اكتبي طولك بالسنتيمتر، مثلًا 160.";
      if (!w || w < 30 || w > 250) return "اكتبي وزنك بالكيلو، مثلًا 63.5.";
    }
    if (s === "goal" && !a.goal) return "اختاري هدفك.";
    if (s === "workout") {
      if (!a.workout.days) return "اختاري كم يوم تقدرين تتمرنين.";
      if (!a.workout.place) return "اختاري وين بتتمرنين.";
      if (!a.workout.level) return "اختاري مستواك.";
    }
    if (s === "final" && !a.consent) return "وافقي على التأكيد قبل الإرسال.";
    return null;
  }

  function next() {
    const msg = check(step);
    if (msg) {
      setError(msg);
      return;
    }
    if (step === "basics") {
      setA({
        age: parseNumber(draft!.numbers.age),
        height_cm: parseNumber(draft!.numbers.height),
        weight_kg: parseNumber(draft!.numbers.weight)
      });
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    const msg = check("final");
    if (msg) {
      setError(msg);
      return;
    }
    if (!client || !auth.profile) return;
    setSaving(true);
    setError(null);

    const answers: IntakeAnswers = {
      ...a,
      age: parseNumber(draft!.numbers.age),
      height_cm: parseNumber(draft!.numbers.height),
      weight_kg: parseNumber(draft!.numbers.weight)
    };

    let inbodyPath = editing?.inbody_path || null;
    if (inbodyFile) {
      const path = `${auth.profile.id}/${safeFileName(inbodyFile.name)}`;
      const { error: upErr } = await supabase.storage.from("inbody").upload(path, inbodyFile, { upsert: false });
      if (upErr) {
        setSaving(false);
        setError("ما قدرنا نرفع ملف الـInBody. جربي صورة أصغر أو ملف PDF، أو أرسلي بدونه.");
        return;
      }
      inbodyPath = path;
    }

    const row = {
      order_number: draft!.orderNumber.trim(),
      wants_nutrition: draft!.wantsNutrition,
      wants_workout: draft!.wantsWorkout,
      wants_followup: draft!.wantsFollowup,
      answers,
      inbody_path: inbodyPath
    };

    const result = editing
      ? await supabase.from("plan_requests").update(row).eq("id", editing.id)
      : await supabase.from("plan_requests").insert({ ...row, client_id: client.id });

    setSaving(false);
    if (result.error) {
      setError(
        result.error.code === "23505"
          ? "رقم الطلب هذا مسجل من قبل. تأكدي من الرقم، وإذا متأكدة إنه صحيح تواصلي مع المدربة."
          : "ما قدرنا نرسل معلوماتك. تأكدي من الاتصال وجربي مرة ثانية."
      );
      return;
    }

    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    }
    router.replace("/client/dashboard?sent=1");
  }

  const isLast = stepIndex >= steps.length - 1;

  return shell(
    <div className="panel p-5 sm:p-7">
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm font-bold text-slate-500">
          <span>{STEP_TITLES[step]}</span>
          <span>
            {stepIndex + 1} من {steps.length}
          </span>
        </div>
        <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-zahraa-coral" : "bg-slate-200"}`} />
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {step === "order" ? (
          <>
            <div>
              <h2 className="section-title">وش اشتريتي من المتجر؟</h2>
              <p className="muted-text mt-1">نحتاج رقم الطلب عشان نتأكد من اشتراكك ونجهز لك الخطة الصحيحة.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="order">رقم الطلب في سلة</label>
              <input
                id="order"
                className="field-input"
                inputMode="numeric"
                dir="ltr"
                value={draft.orderNumber}
                disabled={Boolean(editing?.order_verified)}
                onChange={(e) => setDraft({ ...draft, orderNumber: e.target.value })}
                placeholder="مثلًا 123456789"
              />
            </div>
            <div className="space-y-3">
              <span className="field-label">نوع الاشتراك (اختاري كل اللي اشتريتيه)</span>
              <Option on={draft.wantsNutrition} title="جدول غذائي" onClick={() => setDraft({ ...draft, wantsNutrition: !draft.wantsNutrition })} />
              <Option on={draft.wantsWorkout} title="جدول رياضي" onClick={() => setDraft({ ...draft, wantsWorkout: !draft.wantsWorkout })} />
              <Option on={draft.wantsFollowup} title="متابعة مع المدربة" onClick={() => setDraft({ ...draft, wantsFollowup: !draft.wantsFollowup })} />
            </div>
          </>
        ) : null}

        {step === "basics" ? (
          <>
            <h2 className="section-title">عرّفينا عليك</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="name">الاسم</label>
                <input id="name" className="field-input" value={a.full_name} onChange={(e) => setA({ full_name: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="phone">رقم الجوال</label>
                <input id="phone" className="field-input" dir="ltr" inputMode="tel" value={a.phone} onChange={(e) => setA({ phone: e.target.value })} placeholder="05xxxxxxxx" />
              </div>
              <div>
                <label className="field-label" htmlFor="age">العمر</label>
                <input id="age" className="field-input" inputMode="numeric" value={draft.numbers.age} onChange={(e) => setDraft({ ...draft, numbers: { ...draft.numbers, age: e.target.value } })} />
              </div>
              <div>
                <span className="field-label">الجنس</span>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(GENDERS) as (keyof typeof GENDERS)[]).map((g) => (
                    <Chip key={g} on={a.gender === g} label={GENDERS[g]} onClick={() => setA({ gender: g })} />
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="height">الطول (سم)</label>
                <input id="height" className="field-input" inputMode="decimal" value={draft.numbers.height} onChange={(e) => setDraft({ ...draft, numbers: { ...draft.numbers, height: e.target.value } })} placeholder="160" />
              </div>
              <div>
                <label className="field-label" htmlFor="weight">الوزن (كجم)</label>
                <input id="weight" className="field-input" inputMode="decimal" value={draft.numbers.weight} onChange={(e) => setDraft({ ...draft, numbers: { ...draft.numbers, weight: e.target.value } })} placeholder="63.5" />
              </div>
            </div>
          </>
        ) : null}

        {step === "goal" ? (
          <>
            <h2 className="section-title">وش هدفك؟</h2>
            <div className="space-y-3">
              {(Object.keys(GOALS) as (keyof typeof GOALS)[]).map((g) => (
                <Option key={g} on={a.goal === g} title={GOALS[g]} onClick={() => setA({ goal: g })} />
              ))}
            </div>
            <div>
              <label className="field-label" htmlFor="goal-details">اشرحي لنا عن هدفك أكثر</label>
              <textarea id="goal-details" className="field-input min-h-[110px]" value={a.goal_details} onChange={(e) => setA({ goal_details: e.target.value })} placeholder="مثلًا: أبي أنزل دهون البطن وأشد الأرداف، وجربت أنظمة قبل وما ثبتت" />
            </div>
            <div>
              <span className="field-label">عندك أي حالة صحية؟ (اختياري)</span>
              <div className="flex flex-wrap gap-2">
                {HEALTH_OPTIONS.map((h) => (
                  <Chip key={h} on={a.health.includes(h)} label={h} onClick={() => setA({ health: toggle(a.health, h) })} />
                ))}
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="health-notes">تفاصيل صحية أو أدوية (اختياري)</label>
              <textarea id="health-notes" className="field-input min-h-[80px]" value={a.health_notes} onChange={(e) => setA({ health_notes: e.target.value })} />
            </div>
          </>
        ) : null}

        {step === "nutrition" ? (
          <>
            <div>
              <h2 className="section-title">الخطة الغذائية</h2>
              <p className="muted-text mt-1">الخطة بتكون سهلة ومتنوعة. قولي لنا وش ما يناسبك عشان ما يطلع لك.</p>
            </div>
            <div>
              <span className="field-label">أشياء ما تاكلينها أبدًا (حساسية أو ما تناسبك)</span>
              <div className="flex flex-wrap gap-2">
                {EXCLUDED_OPTIONS.map((x) => (
                  <Chip key={x} on={a.nutrition.excluded.includes(x)} label={x} onClick={() => setN({ excluded: toggle(a.nutrition.excluded, x) })} />
                ))}
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="dislikes">أصناف ما تحبينها</label>
              <textarea id="dislikes" className="field-input min-h-[80px]" value={a.nutrition.dislikes} onChange={(e) => setN({ dislikes: e.target.value })} placeholder="مثلًا: الشوفان، الفطر، الأكل الحار" />
            </div>
            <div>
              <span className="field-label">كم وجبة تفضلين في اليوم؟</span>
              <div className="flex flex-wrap gap-2">
                {[3, 4, 5].map((n) => (
                  <Chip key={n} on={a.nutrition.meals_per_day === n} label={`${n} وجبات`} onClick={() => setN({ meals_per_day: a.nutrition.meals_per_day === n ? null : n })} />
                ))}
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="food-notes">ملاحظات على الأكل</label>
              <textarea id="food-notes" className="field-input min-h-[80px]" value={a.nutrition.notes} onChange={(e) => setN({ notes: e.target.value })} placeholder="مثلًا: أفضل الأكل من الموجود في البيت، أحب الحلا، دوامي طويل" />
            </div>
          </>
        ) : null}

        {step === "workout" ? (
          <>
            <h2 className="section-title">الخطة الرياضية</h2>
            <div>
              <span className="field-label">كم يوم تقدرين تتمرنين في الأسبوع؟</span>
              <div className="grid grid-cols-4 gap-2">
                {[3, 4, 5, 6].map((n) => (
                  <Chip key={n} on={a.workout.days === n} label={`${n} أيام`} onClick={() => setW({ days: n })} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <span className="field-label">وين بتتمرنين؟</span>
              {(Object.keys(PLACES) as (keyof typeof PLACES)[]).map((p) => (
                <Option key={p} on={a.workout.place === p} title={PLACES[p]} onClick={() => setW({ place: p })} />
              ))}
            </div>
            <div className="space-y-3">
              <span className="field-label">مستواك في التمرين</span>
              {(Object.keys(LEVELS) as (keyof typeof LEVELS)[]).map((l) => (
                <Option key={l} on={a.workout.level === l} title={LEVELS[l].split(":")[0]} sub={LEVELS[l].split(":")[1]} onClick={() => setW({ level: l })} />
              ))}
            </div>
            <div>
              <span className="field-label">عندك إصابة أو ألم؟ (اختياري)</span>
              <div className="flex flex-wrap gap-2">
                {INJURY_OPTIONS.map((x) => (
                  <Chip key={x} on={a.workout.injuries.includes(x)} label={x} onClick={() => setW({ injuries: toggle(a.workout.injuries, x) })} />
                ))}
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="workout-notes">ملاحظات على التمرين</label>
              <textarea id="workout-notes" className="field-input min-h-[80px]" value={a.workout.notes} onChange={(e) => setW({ notes: e.target.value })} placeholder="مثلًا: أكره اللانجز، الكيبل دايم زحمة، أبي تركيز على الأرداف" />
            </div>
          </>
        ) : null}

        {step === "final" ? (
          <>
            <h2 className="section-title">آخر خطوة</h2>
            <div>
              <span className="field-label">تحليل InBody (اختياري)</span>
              <label className="flex min-h-[64px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:border-slate-300">
                <FileUp size={20} className="text-zahraa-coral" />
                <span className="min-w-0 truncate">
                  {inbodyFile ? inbodyFile.name : editing?.inbody_path ? "مرفوع. اختاري ملف ثاني لو تبين تبدلينه" : "ارفعي صورة أو PDF"}
                </span>
                <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => setInbodyFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div>
              <span className="field-label">من وين عرفتينا؟</span>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((s) => (
                  <Chip key={s} on={a.source === s} label={s} onClick={() => setA({ source: a.source === s ? "" : s })} />
                ))}
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="comments">أي شي ثاني تحبين نعرفه؟</label>
              <textarea id="comments" className="field-input min-h-[90px]" value={a.comments} onChange={(e) => setA({ comments: e.target.value })} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-zahraa-mist p-4 text-sm leading-6 text-slate-700">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#F26539]" checked={a.consent} onChange={(e) => setA({ consent: e.target.checked })} />
              <span>أأكد إن المعلومات صحيحة، وإني عبيت معلومات الخطة اللي اشتريتها فقط.</span>
            </label>
          </>
        ) : null}

        {error ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="flex gap-3 pt-2">
          {stepIndex > 0 ? (
            <button type="button" className="secondary-button" onClick={() => { setError(null); setStepIndex((i) => i - 1); }}>
              <ArrowRight size={18} />
              رجوع
            </button>
          ) : null}
          {isLast ? (
            <button type="button" className="primary-button flex-1" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              {editing ? "حفظ التعديل" : "أرسلي معلوماتي"}
            </button>
          ) : (
            <button type="button" className="primary-button flex-1" onClick={next}>
              التالي
              <ArrowLeft size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
