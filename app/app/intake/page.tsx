"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGender, useGenderText } from "@/lib/gender";
import { ArrowLeft, Check, ChevronRight, FileUp, Loader2, Send } from "lucide-react";
import { Brand, Loading } from "@/components/ui";
import { safeFileName } from "@/lib/format";
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

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Pick({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="pick" aria-pressed={on} onClick={onClick}>
      {on ? <Check /> : null}
      {label}
    </button>
  );
}

function Opt({ on, title, sub, onClick }: { on: boolean; title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" className="opt" aria-pressed={on} onClick={onClick}>
      <span className="radio" />
      <span>
        <span className="opt-t">{title}</span>
        {sub ? <span className="opt-s">{sub}</span> : null}
      </span>
    </button>
  );
}

const draftFrom = (a: IntakeAnswers, rest: Omit<Draft, "answers" | "numbers">): Draft => ({
  ...rest,
  answers: a,
  numbers: { age: a.age?.toString() || "", height: a.height_cm?.toString() || "", weight: a.weight_kg?.toString() || "" }
});

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
  const root = useRef<HTMLDivElement>(null);
  // Text follows the gender picked in the form (or the profile's).
  useGenderText(root, draft?.answers.gender || getGender());

  const draftKey = auth.profile ? `zf-intake-draft-${auth.profile.id}` : null;

  useEffect(() => {
    async function load() {
      if (!auth.profile) return;
      const editId = new URLSearchParams(window.location.search).get("edit");

      const { data: c } = await supabase.from("clients").select("*").eq("profile_id", auth.profile.id).maybeSingle();
      if (!c) {
        setBlocked("حسابك ما انربط بملف مشتركة. تواصلي مع المدربة.");
        setLoading(false);
        return;
      }
      setClient(c as Client);

      const { data: rs } = await supabase.from("plan_requests").select("*").eq("profile_id", auth.profile.id).order("submitted_at", { ascending: false });
      const list = (rs as PlanRequest[] | null) || [];

      if (editId) {
        const req = list.find((r) => r.id === editId);
        if (!req) setBlocked("ما لقينا هذا الطلب.");
        else if (req.status !== "submitted") setBlocked("المدربة بدأت تجهز خطتك، فما تقدرين تعدلين المعلومات الحين. إذا فيه شي مهم تواصلي معها.");
        else {
          setEditing(req);
          setDraft(
            draftFrom(normalizeAnswers(req.answers), {
              orderNumber: req.order_number,
              wantsNutrition: req.wants_nutrition,
              wantsWorkout: req.wants_workout,
              wantsFollowup: req.wants_followup
            })
          );
        }
        setLoading(false);
        return;
      }

      if (list.some((r) => r.status === "submitted" || r.status === "in_progress")) {
        setBlocked("عندك طلب ما خلص للحين. تشوفينه في الرئيسية.");
        setLoading(false);
        return;
      }

      let saved: Draft | null = null;
      try {
        const raw = localStorage.getItem(`zf-intake-draft-${auth.profile.id}`);
        if (raw) saved = JSON.parse(raw) as Draft;
      } catch {}
      if (saved) {
        setDraft({ ...saved, answers: normalizeAnswers(saved.answers) });
      } else {
        const prev = list[0] ? normalizeAnswers(list[0].answers) : emptyAnswers();
        setDraft(
          draftFrom(
            { ...prev, full_name: prev.full_name || auth.profile.full_name || "", phone: prev.phone || auth.profile.phone || "", consent: false },
            { orderNumber: "", wantsNutrition: false, wantsWorkout: false, wantsFollowup: false }
          )
        );
      }
      setLoading(false);
    }
    load();
  }, [auth.profile]);

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

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;

  const frame = (body: React.ReactNode) => (
    <div className="app" ref={root}>
      <div className="safe-top" aria-hidden="true" />
      <header className="top gutter">
        <Link className="icon-btn" href="/app" aria-label="رجوع للرئيسية">
          <ChevronRight />
        </Link>
        <Brand height={34} />
        <span style={{ width: 44 }} />
      </header>
      <main key={a.gender || "none"} className="screen gutter" style={{ paddingBottom: 40 }}>
        {body}
      </main>
    </div>
  );

  if (blocked || !draft) {
    return frame(
      <>
        <p className="alert info">{blocked || "ما قدرنا نحمل النموذج."}</p>
        <Link className="btn btn-g" href="/app">
          رجوع للرئيسية
        </Link>
      </>
    );
  }

  const idx = Math.min(stepIndex, steps.length - 1);
  const step = steps[idx];
  const a = draft.answers;
  const setA = (patch: Partial<IntakeAnswers>) => setDraft({ ...draft, answers: { ...a, ...patch } });
  const setN = (patch: Partial<IntakeAnswers["nutrition"]>) => setA({ nutrition: { ...a.nutrition, ...patch } });
  const setW = (patch: Partial<IntakeAnswers["workout"]>) => setA({ workout: { ...a.workout, ...patch } });
  const setNum = (k: keyof Draft["numbers"], v: string) => setDraft({ ...draft, numbers: { ...draft.numbers, [k]: v } });

  function check(s: StepKey): string | null {
    const d = draft!;
    if (s === "order") {
      if (d.orderNumber.trim().length < 3) return "اكتبي رقم طلبك من سلة.";
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
    if (s === "final" && !a.consent) return "علمي على التأكيد قبل الإرسال.";
    return null;
  }

  function next() {
    const msg = check(step);
    if (msg) return setError(msg);
    setError(null);
    setStepIndex(idx + 1);
    window.scrollTo({ top: 0 });
  }

  function back() {
    setError(null);
    setStepIndex(Math.max(0, idx - 1));
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    const msg = check("final");
    if (msg) return setError(msg);
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
        return setError("ما قدرنا نرفع ملف الـInBody. جربي صورة أصغر أو ملف PDF، أو أرسلي بدونه.");
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
      return setError(
        result.error.code === "23505"
          ? "رقم الطلب هذا مسجل من قبل. تأكدي من الرقم، وإذا متأكدة إنه صحيح تواصلي مع المدربة."
          : "ما قدرنا نرسل معلوماتك. تأكدي من الاتصال وجربي مرة ثانية."
      );
    }
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    }
    router.replace("/app?sent=1");
  }

  const last = idx >= steps.length - 1;

  return frame(
    <>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row between small muted">
          <span>{editing ? "تعديل معلوماتك" : "معلومات خطتك"}</span>
          <span className="num">
            {idx + 1} / {steps.length}
          </span>
        </div>
        <div className="progress" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s} className={i <= idx ? "on" : undefined} />
          ))}
        </div>
      </div>

      {step === "order" ? (
        <>
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 24 }}>وش اشتريتي من المتجر؟</h1>
            <p className="muted">نحتاج رقم الطلب عشان نتأكد من اشتراكك ونجهز لك الخطة الصحيحة.</p>
          </div>
          <div className="field">
            <label htmlFor="order">رقم الطلب في سلة</label>
            <input
              id="order"
              className="inp num"
              inputMode="numeric"
              dir="ltr"
              value={draft.orderNumber}
              disabled={Boolean(editing?.order_verified)}
              onChange={(e) => setDraft({ ...draft, orderNumber: e.target.value })}
              placeholder="123456789"
            />
            <span className="note">تلقينه في رسالة تأكيد الطلب، أو في «طلباتي» داخل المتجر.</span>
          </div>
          <div className="field">
            <span className="flabel">نوع اشتراكك (اختاري كل اللي اشتريتيه)</span>
            <div className="opts">
              <Opt on={draft.wantsNutrition} title="جدول غذائي" onClick={() => setDraft({ ...draft, wantsNutrition: !draft.wantsNutrition })} />
              <Opt on={draft.wantsWorkout} title="جدول رياضي" onClick={() => setDraft({ ...draft, wantsWorkout: !draft.wantsWorkout })} />
              <Opt on={draft.wantsFollowup} title="متابعة مع المدربة" onClick={() => setDraft({ ...draft, wantsFollowup: !draft.wantsFollowup })} />
            </div>
          </div>
        </>
      ) : null}

      {step === "basics" ? (
        <>
          <h1 style={{ fontSize: 24 }}>عرفينا عليك</h1>
          <div className="field">
            <label htmlFor="name">الاسم</label>
            <input id="name" className="inp" value={a.full_name} onChange={(e) => setA({ full_name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="phone">رقم الجوال</label>
            <input id="phone" className="inp" dir="ltr" inputMode="tel" value={a.phone} onChange={(e) => setA({ phone: e.target.value })} placeholder="05xxxxxxxx" />
          </div>
          <div className="field">
            <span className="flabel">الجنس</span>
            <div className="picks">
              {(Object.keys(GENDERS) as (keyof typeof GENDERS)[]).map((g) => (
                <Pick key={g} on={a.gender === g} label={GENDERS[g]} onClick={() => setA({ gender: g })} />
              ))}
            </div>
          </div>
          <div className="grid3">
            <div className="field">
              <label htmlFor="age">العمر</label>
              <input id="age" className="inp num" inputMode="numeric" value={draft.numbers.age} onChange={(e) => setNum("age", e.target.value)} placeholder="27" />
            </div>
            <div className="field">
              <label htmlFor="height">الطول (سم)</label>
              <input id="height" className="inp num" inputMode="decimal" value={draft.numbers.height} onChange={(e) => setNum("height", e.target.value)} placeholder="160" />
            </div>
            <div className="field">
              <label htmlFor="weight">الوزن (كجم)</label>
              <input id="weight" className="inp num" inputMode="decimal" value={draft.numbers.weight} onChange={(e) => setNum("weight", e.target.value)} placeholder="63.5" />
            </div>
          </div>
        </>
      ) : null}

      {step === "goal" ? (
        <>
          <h1 style={{ fontSize: 24 }}>وش هدفك؟</h1>
          <div className="opts">
            {(Object.keys(GOALS) as (keyof typeof GOALS)[]).map((g) => (
              <Opt key={g} on={a.goal === g} title={GOALS[g]} onClick={() => setA({ goal: g })} />
            ))}
          </div>
          <div className="field">
            <label htmlFor="goal-details">اشرحي لنا عن هدفك أكثر</label>
            <textarea id="goal-details" className="inp" value={a.goal_details} onChange={(e) => setA({ goal_details: e.target.value })} placeholder="مثلًا: أبي أنزل دهون البطن وأشد الأرداف، وجربت أنظمة قبل وما ثبتت" />
          </div>
          <div className="field">
            <span className="flabel">عندك أي حالة صحية؟ (اختياري)</span>
            <div className="picks">
              {HEALTH_OPTIONS.filter((h) => a.gender !== "male" || (h !== "حامل" && h !== "مرضعة")).map((h) => (
                <Pick key={h} on={a.health.includes(h)} label={h} onClick={() => setA({ health: toggle(a.health, h) })} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="health-notes">تفاصيل صحية أو أدوية (اختياري)</label>
            <textarea id="health-notes" className="inp" value={a.health_notes} onChange={(e) => setA({ health_notes: e.target.value })} />
          </div>
        </>
      ) : null}

      {step === "nutrition" ? (
        <>
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 24 }}>الخطة الغذائية</h1>
            <p className="muted">الخطة بتكون سهلة ومتنوعة. قولي لنا وش ما يناسبك عشان ما يطلع لك.</p>
          </div>
          <div className="field">
            <span className="flabel">أشياء ما تاكلينها أبدًا (حساسية أو ما تناسبك)</span>
            <div className="picks">
              {EXCLUDED_OPTIONS.map((x) => (
                <Pick key={x} on={a.nutrition.excluded.includes(x)} label={x} onClick={() => setN({ excluded: toggle(a.nutrition.excluded, x) })} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="dislikes">أصناف ما تحبينها</label>
            <textarea id="dislikes" className="inp" value={a.nutrition.dislikes} onChange={(e) => setN({ dislikes: e.target.value })} placeholder="مثلًا: الشوفان، الفطر، الأكل الحار" />
          </div>
          <div className="field">
            <span className="flabel">كم وجبة تفضلين في اليوم؟</span>
            <div className="picks">
              {[3, 4, 5].map((n) => (
                <Pick key={n} on={a.nutrition.meals_per_day === n} label={`${n} وجبات`} onClick={() => setN({ meals_per_day: a.nutrition.meals_per_day === n ? null : n })} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="food-notes">ملاحظات على الأكل</label>
            <textarea id="food-notes" className="inp" value={a.nutrition.notes} onChange={(e) => setN({ notes: e.target.value })} placeholder="مثلًا: أفضل الأكل من الموجود في البيت، أحب الحلا، دوامي طويل" />
          </div>
        </>
      ) : null}

      {step === "workout" ? (
        <>
          <h1 style={{ fontSize: 24 }}>الخطة الرياضية</h1>
          <div className="field">
            <span className="flabel">كم يوم تقدرين تتمرنين في الأسبوع؟</span>
            <div className="picks">
              {[3, 4, 5, 6].map((n) => (
                <Pick key={n} on={a.workout.days === n} label={`${n} أيام`} onClick={() => setW({ days: n })} />
              ))}
            </div>
          </div>
          <div className="field">
            <span className="flabel">وين بتتمرنين؟</span>
            <div className="opts">
              {(Object.keys(PLACES) as (keyof typeof PLACES)[]).map((p) => (
                <Opt key={p} on={a.workout.place === p} title={PLACES[p]} onClick={() => setW({ place: p })} />
              ))}
            </div>
          </div>
          <div className="field">
            <span className="flabel">مستواك في التمرين</span>
            <div className="opts">
              {(Object.keys(LEVELS) as (keyof typeof LEVELS)[]).map((l) => (
                <Opt key={l} on={a.workout.level === l} title={LEVELS[l].split(":")[0]} sub={LEVELS[l].split(":")[1]?.trim()} onClick={() => setW({ level: l })} />
              ))}
            </div>
          </div>
          <div className="field">
            <span className="flabel">عندك إصابة أو ألم؟ (اختياري)</span>
            <div className="picks">
              {INJURY_OPTIONS.map((x) => (
                <Pick key={x} on={a.workout.injuries.includes(x)} label={x} onClick={() => setW({ injuries: toggle(a.workout.injuries, x) })} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="workout-notes">ملاحظات على التمرين</label>
            <textarea id="workout-notes" className="inp" value={a.workout.notes} onChange={(e) => setW({ notes: e.target.value })} placeholder="مثلًا: أكره اللانجز، الكيبل دايم زحمة، أبي تركيز على الأرداف" />
          </div>
        </>
      ) : null}

      {step === "final" ? (
        <>
          <h1 style={{ fontSize: 24 }}>آخر خطوة</h1>
          <div className="field">
            <span className="flabel">تحليل InBody (اختياري)</span>
            <label className="file-drop">
              <FileUp />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inbodyFile ? inbodyFile.name : editing?.inbody_path ? "مرفوع. اختاري ملف ثاني لو تبين تبدلينه" : "ارفعي صورة أو PDF"}
              </span>
              <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => setInbodyFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="field">
            <span className="flabel">من وين عرفتينا؟</span>
            <div className="picks">
              {SOURCE_OPTIONS.map((s) => (
                <Pick key={s} on={a.source === s} label={s} onClick={() => setA({ source: a.source === s ? "" : s })} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="comments">أي شي ثاني تحبين نعرفه؟</label>
            <textarea id="comments" className="inp" value={a.comments} onChange={(e) => setA({ comments: e.target.value })} />
          </div>
          <label className="consent">
            <input type="checkbox" checked={a.consent} onChange={(e) => setA({ consent: e.target.checked })} />
            <span>أأكد إن المعلومات صحيحة، وإني عبيت معلومات الخطة اللي اشتريتها فقط.</span>
          </label>
        </>
      ) : null}

      {error ? <p className="alert err" role="alert">{error}</p> : null}

      <div className="row">
        {idx > 0 ? (
          <button type="button" className="btn btn-g" onClick={back}>
            رجوع
          </button>
        ) : null}
        {last ? (
          <button type="button" className="btn btn-p" style={{ flex: 1 }} onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="spin" /> : <Send />}
            {editing ? "حفظ التعديل" : "أرسلي معلوماتي"}
          </button>
        ) : (
          <button type="button" className="btn btn-p" style={{ flex: 1 }} onClick={next}>
            التالي
            <ArrowLeft />
          </button>
        )}
      </div>
    </>
  );
}
