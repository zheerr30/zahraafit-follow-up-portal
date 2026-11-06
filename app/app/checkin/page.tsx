"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Camera, X } from "lucide-react";
import { ClientShell, Loading, useToast } from "@/components/ui";
import { COMMIT_LABEL, FEELINGS, FEELING_LABEL, addDays, dayName, followupInfo, shrinkPhoto } from "@/lib/followup";
import { formatDate } from "@/lib/format";
import { accountOf } from "@/lib/account";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";
import type { FollowupPhoto, WeeklyFollowup } from "@/lib/types";

type PhotoType = "front" | "side" | "back";
const PHOTO_TYPES: [PhotoType, string][] = [["front", "أمام"], ["side", "جنب"], ["back", "خلف"]];

type Form = {
  weight: string; waist: string; hips: string;
  feeling: number | null; nutrition: number | null; workout: number | null;
  steps: string; sleep: string; cycle: "" | "نعم" | "لا";
  changes: string; notes: string;
};
const EMPTY: Form = { weight: "", waist: "", hips: "", feeling: null, nutrition: null, workout: null, steps: "", sleep: "", cycle: "", changes: "", notes: "" };

const toNum = (s: string) => {
  const n = Number(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function Scale({ value, onChange, labels, emojis, name }: { value: number | null; onChange: (v: number) => void; labels: string[]; emojis?: string[]; name: string }) {
  return (
    <div className="scale" role="radiogroup" aria-label={name}>
      {labels.map((l, i) => (
        <button key={l} type="button" role="radio" aria-checked={value === i + 1} onClick={() => onChange(i + 1)}>
          <b aria-hidden="true">{emojis ? emojis[i] : i + 1}</b>
          <span>{l}</span>
        </button>
      ))}
    </div>
  );
}

export default function CheckinPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const [list, setList] = useState<WeeklyFollowup[]>([]);
  const [photos, setPhotos] = useState<(FollowupPhoto & { url?: string })[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [picked, setPicked] = useState<Partial<Record<PhotoType, { blob: Blob; preview: string }>>>({});
  const [hint, setHint] = useState<{ meals: number | null; workouts: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const client = cp.client;
  const info = followupInfo(client, undefined, accountOf(auth.profile).sub);
  const current = info.openDate ? list.find((x) => x.week_date === info.openDate) || null : null;

  useEffect(() => {
    if (cp.loading || !client) {
      if (!cp.loading) setReady(true);
      return;
    }
    (async () => {
      const since = addDays(todayKey(), -7);
      const [{ data: f }, { data: ph }, { data: b }, { data: d }, { data: w }] = await Promise.all([
        supabase.from("weekly_followups").select("*").eq("client_id", client.id).order("week_date", { ascending: false }),
        supabase.from("followup_photos").select("*").eq("client_id", client.id),
        supabase.from("body_logs").select("weight_kg, waist_cm, hips_cm").eq("client_id", client.id).order("log_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("daily_logs").select("meals").eq("client_id", client.id).gte("log_date", since),
        supabase.from("workout_logs").select("performed_on").eq("client_id", client.id).gte("performed_on", since)
      ]);
      const fl = (f as WeeklyFollowup[] | null) || [];
      setList(fl);
      const phs = (ph as FollowupPhoto[] | null) || [];
      if (phs.length) {
        const { data: signed } = await supabase.storage.from("followup-photos").createSignedUrls(phs.map((x) => x.file_path), 3600);
        const byPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
        setPhotos(phs.map((x) => ({ ...x, url: byPath.get(x.file_path) || undefined })));
      }
      // Averages from her week's logs, to help her answer.
      const logs = (d as { meals: Record<string, unknown> }[] | null) || [];
      const per = cp.meal?.days[0]?.meals.length || 0;
      const eaten = logs.reduce((a, x) => a + Object.entries(x.meals || {}).filter(([k, v]) => /^\d+-\d+$/.test(k) && v === true).length, 0);
      setHint({ meals: per ? Math.min(100, Math.round((eaten / (per * 7)) * 100)) : null, workouts: new Set(((w as { performed_on: string }[] | null) || []).map((x) => x.performed_on)).size });
      const steps = logs.map((x) => Number(String((x.meals?._day as { steps?: string } | undefined)?.steps || "").replace(/\D/g, ""))).filter(Boolean);
      const sleep = logs.map((x) => Number((x.meals?._day as { sleep?: string } | undefined)?.sleep)).filter(Boolean);
      const body = b as { weight_kg: number | null; waist_cm: number | null; hips_cm: number | null } | null;
      setForm((cur) => ({
        ...cur,
        weight: body?.weight_kg ? String(body.weight_kg) : "",
        waist: body?.waist_cm ? String(body.waist_cm) : "",
        hips: body?.hips_cm ? String(body.hips_cm) : "",
        steps: steps.length ? String(Math.round(steps.reduce((a, x) => a + x, 0) / steps.length)) : "",
        sleep: sleep.length ? String(Math.round((sleep.reduce((a, x) => a + x, 0) / sleep.length) * 10) / 10) : ""
      }));
      setReady(true);
    })();
  }, [cp.loading, client, cp.meal]);

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;

  function startEdit(f: WeeklyFollowup) {
    setForm({
      weight: f.weight_kg ? String(f.weight_kg) : "", waist: f.waist_cm ? String(f.waist_cm) : "", hips: f.hips_cm ? String(f.hips_cm) : "",
      feeling: f.feeling || null, nutrition: f.nutrition_commitment, workout: f.workout_commitment,
      steps: f.steps_count ? String(f.steps_count) : "", sleep: f.sleep_hours ? String(f.sleep_hours) : "",
      cycle: f.menstrual_cycle === "نعم" || f.menstrual_cycle === "لا" ? f.menstrual_cycle : "",
      changes: f.changes_requested || "", notes: f.client_notes || ""
    });
    setPicked({});
    setEditing(true);
  }

  async function pick(type: PhotoType, file: File | undefined) {
    if (!file) return;
    try {
      const blob = await shrinkPhoto(file);
      setPicked((cur) => ({ ...cur, [type]: { blob, preview: URL.createObjectURL(blob) } }));
    } catch {
      toast.show("ما قدرنا نقرأ الصورة. جربي صورة ثانية.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!client || !info.openDate) return;
    if (!form.feeling || !form.nutrition || !form.workout) return setErr("جاوبي على شعورك والتزامك بالأكل والتمرين.");
    setBusy(true);
    setErr(null);
    const row = {
      client_id: client.id,
      week_date: info.openDate,
      weight_kg: toNum(form.weight), waist_cm: toNum(form.waist), hips_cm: toNum(form.hips),
      feeling: form.feeling, nutrition_commitment: form.nutrition, workout_commitment: form.workout,
      steps_count: toNum(form.steps) ? Math.round(toNum(form.steps)!) : null, sleep_hours: toNum(form.sleep),
      menstrual_cycle: form.cycle || null,
      changes_requested: form.changes.trim() || null, client_notes: form.notes.trim() || null
    };
    const res = current
      ? await supabase.from("weekly_followups").update(row).eq("id", current.id).select("*").single()
      : await supabase.from("weekly_followups").insert(row).select("*").single();
    if (res.error || !res.data) {
      setBusy(false);
      return setErr(res.error?.code === "42501" ? "المدربة ردت على هالمتابعة، ما تقدرين تعدلينها." : "ما انحفظت. تأكدي من الاتصال وجربي مرة ثانية.");
    }
    const saved = res.data as WeeklyFollowup;
    const newPhotos: (FollowupPhoto & { url?: string })[] = [];
    let photoFailed = false;
    for (const [type, p] of Object.entries(picked) as [PhotoType, { blob: Blob; preview: string }][]) {
      const path = `${client.id}/${saved.id}/${type}-${Date.now()}.jpg`;
      const up = await supabase.storage.from("followup-photos").upload(path, p.blob, { contentType: "image/jpeg" });
      if (up.error) { photoFailed = true; continue; }
      await supabase.from("followup_photos").delete().eq("followup_id", saved.id).eq("photo_type", type);
      const ins = await supabase.from("followup_photos").insert({ followup_id: saved.id, client_id: client.id, photo_type: type, file_path: path }).select("*").single();
      if (ins.data) newPhotos.push({ ...(ins.data as FollowupPhoto), url: p.preview });
    }
    // Weight and measurements also go to «تقدمي».
    if (row.weight_kg || row.waist_cm || row.hips_cm) {
      await supabase.from("body_logs").upsert({ client_id: client.id, log_date: todayKey(), weight_kg: row.weight_kg, waist_cm: row.waist_cm, hips_cm: row.hips_cm }, { onConflict: "client_id,log_date" });
    }
    setList((cur) => [saved, ...cur.filter((x) => x.id !== saved.id)]);
    setPhotos((cur) => [...cur.filter((x) => !(x.followup_id === saved.id && newPhotos.some((n) => n.photo_type === x.photo_type))), ...newPhotos]);
    setPicked({});
    setEditing(false);
    setBusy(false);
    window.scrollTo(0, 0);
    toast.show(photoFailed ? "انحفظت المتابعة، بس بعض الصور ما ارتفعت. جربي ترفعينها مرة ثانية." : "وصلت متابعتك للمدربة 💪");
  }

  const photosOf = (id: string) => photos.filter((p) => p.followup_id === id);
  const showForm = Boolean(info.openDate) && (!current || editing) && !current?.coach_notes;
  const past = list.filter((x) => x.id !== current?.id);

  function Summary({ f }: { f: WeeklyFollowup }) {
    const ph = photosOf(f.id);
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {f.feeling ? <span className="chip">{FEELINGS[f.feeling - 1]} {FEELING_LABEL[f.feeling - 1]}</span> : null}
          {f.nutrition_commitment ? <span className="chip">🍽️ {COMMIT_LABEL[f.nutrition_commitment - 1]}</span> : null}
          {f.workout_commitment ? <span className="chip">💪 {COMMIT_LABEL[f.workout_commitment - 1]}</span> : null}
          {f.weight_kg ? <span className="chip">⚖️ {Number(f.weight_kg)} كجم</span> : null}
        </div>
        {f.changes_requested ? <p className="small"><b>✏️ تعديلات طلبتيها:</b> {f.changes_requested}</p> : null}
        {f.client_notes ? <p className="small"><b>💭 ملاحظاتك:</b> {f.client_notes}</p> : null}
        {ph.length ? (
          <div className="photo-row">
            {ph.map((p) => (p.url ? <img key={p.id} src={p.url} alt={`صورة ${PHOTO_TYPES.find((t) => t[0] === p.photo_type)?.[1] || ""}`} /> : null))}
          </div>
        ) : null}
        {f.coach_notes ? (
          <div className="reply">
            <b>💬 رد المدربة</b>
            <p style={{ whiteSpace: "pre-line" }}>{f.coach_notes}</p>
          </div>
        ) : (
          <p className="note">⏳ المدربة بتشوفها وترد عليك.</p>
        )}
      </div>
    );
  }

  return (
    <ClientShell title="متابعتي الأسبوعية" sub={info.saturday ? "كل سبت" : info.has ? `الأسبوع ${info.week} من ${info.weeks}` : undefined}>
      {!info.has ? (
        <section className="card stack">
          <b style={{ fontSize: 17 }}>📅 المتابعة الأسبوعية</b>
          <p className="small muted">هذي لمشتركات المتابعة: كل أسبوع تعبين متابعتك (وزنك وقياساتك وصورك وكيف كان أسبوعك)، والمدربة ترد عليك وتعدل خطتك.</p>
          <p className="small muted">لو اشتركتي بالمتابعة، المدربة بتفعلها لك أول ما تبدأ خطتك.</p>
        </section>
      ) : info.saturday ? (
        <section className="card stack" style={{ gap: 6 }}>
          <b style={{ color: "var(--navy)" }}>📅 تسجيلك الأسبوعي كل سبت</b>
          <p className="small muted">كل سبت سجلي وزنك وقياساتك وصورك وكيف كان أسبوعك، وتشوفين تطورك أسبوع بأسبوع. صورك ما يشوفها غيرك وغير المدربة 🔒</p>
          {!info.openDate && info.nextDate ? <p className="small">📅 تسجيلك الجاي <b>{dayName(info.nextDate)}</b>. نذكرك فيه.</p> : null}
        </section>
      ) : (
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row between">
            <span><span className="label" style={{ display: "block" }}>مدة متابعتك</span><b style={{ color: "var(--navy)" }}>{info.weeks} أسابيع</b></span>
            <span style={{ textAlign: "end" }}><span className="label" style={{ display: "block" }}>{info.ended ? "انتهت" : "تنتهي"}</span><b>{formatDate(info.end)}</b></span>
          </div>
          <span aria-hidden="true" style={{ display: "block", height: 8, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
            <i style={{ display: "block", height: "100%", width: `${Math.min(100, (info.week / info.weeks) * 100)}%`, background: "var(--clay)" }} />
          </span>
          {info.ended ? <p className="small">انتهت مدة متابعتك 🌟 لو تبين تكملين، جددي اشتراكك من المتجر.</p>
            : info.daysLeft <= 7 ? <p className="small" style={{ color: "var(--clay-ink)" }}>باقي {info.daysLeft} أيام على نهاية متابعتك. تبين تكملين؟ جددي من المتجر قبل ما تخلص.</p> : null}
          {!info.openDate && info.nextDate && !info.ended ? <p className="small">📅 متابعتك الجاية <b>{dayName(info.nextDate)}</b>. نذكرك فيها.</p> : null}
        </section>
      )}

      {current && !editing ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">✅</span>
            <h2>{info.openWeek ? `متابعة الأسبوع ${info.openWeek}` : "متابعة هالأسبوع"}</h2>
            {!current.coach_notes ? <button type="button" className="aside link" onClick={() => startEdit(current)}>تعديل</button> : null}
          </div>
          <section className="card"><Summary f={current} /></section>
        </>
      ) : null}

      {showForm ? (
        <form className="stack" onSubmit={submit}>
          <div className="sec-title">
            <span className="em" aria-hidden="true">📝</span>
            <h2>{info.openWeek ? `متابعة الأسبوع ${info.openWeek}` : "متابعة هالأسبوع"}</h2>
            <span className="aside">{dayName(info.openDate!)}</span>
          </div>

          <section className="card stack">
            <b>😊 كيف كان شعورك هالأسبوع؟</b>
            <Scale name="شعورك" value={form.feeling} onChange={(v) => setForm({ ...form, feeling: v })} labels={FEELING_LABEL} emojis={FEELINGS} />
          </section>

          <section className="card stack">
            <b>🍽️ كم التزمتي بالأكل؟</b>
            {hint?.meals !== null && hint?.meals !== undefined ? <span className="note">حسب تسجيلك: علمتي على {hint.meals}٪ من وجباتك</span> : null}
            <Scale name="التزامك بالأكل" value={form.nutrition} onChange={(v) => setForm({ ...form, nutrition: v })} labels={COMMIT_LABEL} />
            <b style={{ marginTop: 6 }}>💪 وبالتمرين؟</b>
            {hint ? <span className="note">حسب تسجيلك: {hint.workouts} تمارين هالأسبوع</span> : null}
            <Scale name="التزامك بالتمرين" value={form.workout} onChange={(v) => setForm({ ...form, workout: v })} labels={COMMIT_LABEL} />
          </section>

          <section className="card stack">
            <b>⚖️ وزنك وقياساتك</b>
            <span className="note">قيسي الصبح على الريق بعد الحمام. عبيناها من آخر تسجيل لك، عدليها.</span>
            <div className="grid3">
              {([["weight", "الوزن (كجم)"], ["waist", "الخصر (سم)"], ["hips", "الأرداف (سم)"]] as [keyof Form, string][]).map(([k, l]) => (
                <div key={k} className="field">
                  <label htmlFor={`ci-${k}`}>{l}</label>
                  <input id={`ci-${k}`} className="inp num" inputMode="decimal" value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </section>

          <section className="card stack">
            <b>📸 صورك</b>
            <span className="note">نفس المكان والإضاءة كل أسبوع. صورك ما يشوفها غيرك وغير المدربة 🔒</span>
            <div className="grid3">
              {PHOTO_TYPES.map(([type, label]) => {
                const old = current ? photosOf(current.id).find((p) => p.photo_type === type) : null;
                const src = picked[type]?.preview || old?.url;
                return (
                  <label key={type} className="photo-pick">
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(type, e.target.files?.[0])} />
                    {src ? <img src={src} alt={`صورة ${label}`} /> : <Camera aria-hidden="true" />}
                    <span>{label}</span>
                    {picked[type] ? (
                      <button type="button" className="x" aria-label={`شيلي صورة ${label}`} onClick={(e) => { e.preventDefault(); setPicked((cur) => { const n = { ...cur }; delete n[type]; return n; }); }}><X size={14} /></button>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </section>

          <section className="card stack">
            <div className="grid2">
              <div className="field">
                <label htmlFor="ci-steps">👟 متوسط خطواتك</label>
                <input id="ci-steps" className="inp num" inputMode="numeric" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} placeholder="8000" />
              </div>
              <div className="field">
                <label htmlFor="ci-sleep">😴 متوسط نومك (ساعات)</label>
                <input id="ci-sleep" className="inp num" inputMode="decimal" value={form.sleep} onChange={(e) => setForm({ ...form, sleep: e.target.value })} placeholder="7" />
              </div>
            </div>
            <div className="field">
              <span className="label">🩸 جتك الدورة هالأسبوع؟</span>
              <div className="seg-tabs" role="radiogroup" aria-label="الدورة">
                {(["نعم", "لا"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={form.cycle === v} aria-selected={form.cycle === v} onClick={() => setForm({ ...form, cycle: form.cycle === v ? "" : v })}>{v}</button>
                ))}
              </div>
              <span className="note">تساعد المدربة تفهم تغير الوزن (احتباس الماء).</span>
            </div>
          </section>

          <section className="card stack">
            <div className="field">
              <label htmlFor="ci-changes">✏️ تبين تعديلات للأسبوع الجاي؟</label>
              <textarea id="ci-changes" className="inp" value={form.changes} onChange={(e) => setForm({ ...form, changes: e.target.value })} placeholder="مثلًا: أبي فطور أسرع، ما حبيت وجبة السمك، أبي تمارين في البيت..." />
            </div>
            <div className="field">
              <label htmlFor="ci-notes">💭 شي تبين تقولينه للمدربة؟</label>
              <textarea id="ci-notes" className="inp" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="جوع، طاقة، مزاج، مناسبات، أي شي صار معك" />
            </div>
          </section>

          {err ? <p className="alert err">{err}</p> : null}
          <div className="row" style={{ gap: 8 }}>
            {editing ? <button type="button" className="btn btn-g" onClick={() => setEditing(false)}>إلغاء</button> : null}
            <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={busy}>{busy ? "لحظة... نرفع متابعتك" : "📤 أرسلي متابعتي"}</button>
          </div>
        </form>
      ) : null}

      {past.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">🗂️</span>
            <h2>متابعاتي السابقة</h2>
          </div>
          {past.map((f) => (
            <details key={f.id} className="gsec">
              <summary>
                <span className="em" aria-hidden="true">{f.feeling ? FEELINGS[f.feeling - 1] : "📅"}</span>
                <span>
                  <b>{dayName(f.week_date)}</b>
                  <span className="sub">{f.coach_notes ? "💬 فيها رد من المدربة" : "⏳ تنتظر رد المدربة"}</span>
                </span>
              </summary>
              <div className="gbody"><Summary f={f} /></div>
            </details>
          ))}
        </>
      ) : null}

      {info.has ? (
        <p className="note" style={{ textAlign: "center" }}>
          تبين تشوفين تطور وزنك؟ <Link className="link" href="/app/progress">تقدمي</Link>
        </p>
      ) : null}
      {toast.node}
    </ClientShell>
  );
}
