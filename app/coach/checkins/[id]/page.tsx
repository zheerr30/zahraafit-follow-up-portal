"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { CoachShell, Loading, useToast } from "@/components/ui";
import { COMMIT_LABEL, FEELINGS, FEELING_LABEL, dayName, followupInfo } from "@/lib/followup";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, FollowupPhoto, WeeklyFollowup } from "@/lib/types";

const TYPES: [string, string][] = [["front", "أمام"], ["side", "جنب"], ["back", "خلف"]];

function delta(now: number | null, before: number | null, unit: string) {
  if (!now || !before) return null;
  const d = Math.round((Number(now) - Number(before)) * 10) / 10;
  return <span className={`chip ${d < 0 ? "green" : d > 0 ? "amber" : ""}`} dir="ltr">{d > 0 ? "+" : ""}{d} {unit}</span>;
}

export default function CheckinDetail() {
  const auth = useAuthGuard("admin");
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [f, setF] = useState<WeeklyFollowup | null>(null);
  const [prev, setPrev] = useState<WeeklyFollowup | null>(null);
  const [first, setFirst] = useState<WeeklyFollowup | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<(FollowupPhoto & { url?: string })[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.profile || !params?.id) return;
    (async () => {
      const { data } = await supabase.from("weekly_followups").select("*").eq("id", params.id).maybeSingle();
      if (!data) return setLoading(false);
      const cur = data as WeeklyFollowup;
      setF(cur);
      setReply(cur.coach_notes || "");
      const [{ data: c }, { data: all }, { data: ph }] = await Promise.all([
        supabase.from("clients").select("*").eq("id", cur.client_id).single(),
        supabase.from("weekly_followups").select("*").eq("client_id", cur.client_id).order("week_date", { ascending: true }),
        supabase.from("followup_photos").select("*").eq("client_id", cur.client_id)
      ]);
      const cl = c as Client;
      setClient(cl);
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", cl.profile_id).maybeSingle();
      setName(p?.full_name || "مشتركة");
      const list = (all as WeeklyFollowup[] | null) || [];
      const i = list.findIndex((x) => x.id === cur.id);
      setPrev(i > 0 ? list[i - 1] : null);
      setFirst(i > 0 ? list[0] : null);
      const phs = (ph as FollowupPhoto[] | null) || [];
      if (phs.length) {
        const { data: signed } = await supabase.storage.from("followup-photos").createSignedUrls(phs.map((x) => x.file_path), 3600);
        const byPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
        setPhotos(phs.map((x) => ({ ...x, url: byPath.get(x.file_path) || undefined })));
      }
      setLoading(false);
    })();
  }, [auth.profile, params?.id]);

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;
  if (!f || !client) return <CoachShell><p className="alert err">ما لقينا هالمتابعة.</p></CoachShell>;

  const info = followupInfo(client);
  const wk = Math.round((new Date(f.week_date).getTime() - new Date(info.start || f.week_date).getTime()) / (7 * 864e5));

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from("weekly_followups").update({ coach_notes: reply.trim(), coach_replied_at: new Date().toISOString() }).eq("id", f!.id).select("*").single();
    setBusy(false);
    if (error || !data) return toast.show("ما انرسل. جربي مرة ثانية.");
    setF(data as WeeklyFollowup);
    toast.show("وصل ردك لها 💬 وجاها إشعار لو مشغلة التذكيرات");
  }

  const pics = (id: string | undefined) => photos.filter((p) => p.followup_id === id);
  const nowPics = pics(f.id);
  const firstPics = pics(first?.id);

  return (
    <CoachShell>
      <Link className="link" href="/coach/checkins"><ChevronRight />المتابعات</Link>
      <div className="row between wrap">
        <div>
          <h1 style={{ fontSize: 24 }}>{name}</h1>
          <p className="small muted">متابعة الأسبوع {wk || "—"} من {info.weeks || "—"} · {dayName(f.week_date)} · أرسلتها {formatDate(f.created_at)}</p>
        </div>
        <Link className="btn btn-g btn-sm" href={`/coach/subscribers/${client.id}`}>صفحتها وتسجيلاتها</Link>
      </div>

      <section className="card stack">
        <div className="grid3">
          <div className="stat"><span>😊 شعورها</span><b style={{ fontSize: 20 }}>{f.feeling ? `${FEELINGS[f.feeling - 1]} ${FEELING_LABEL[f.feeling - 1]}` : "—"}</b></div>
          <div className="stat"><span>🍽️ الأكل</span><b style={{ fontSize: 15 }}>{f.nutrition_commitment ? COMMIT_LABEL[f.nutrition_commitment - 1] : "—"}</b></div>
          <div className="stat"><span>💪 التمرين</span><b style={{ fontSize: 15 }}>{f.workout_commitment ? COMMIT_LABEL[f.workout_commitment - 1] : "—"}</b></div>
        </div>
        <dl className="kv">
          <div><dt>⚖️ الوزن</dt><dd className="row" style={{ gap: 6 }}>{f.weight_kg ? `${Number(f.weight_kg)} كجم` : "—"} {delta(f.weight_kg, prev?.weight_kg ?? null, "كجم")}</dd></div>
          <div><dt>📏 الخصر</dt><dd className="row" style={{ gap: 6 }}>{f.waist_cm ? `${Number(f.waist_cm)} سم` : "—"} {delta(f.waist_cm, prev?.waist_cm ?? null, "سم")}</dd></div>
          <div><dt>📏 الأرداف</dt><dd className="row" style={{ gap: 6 }}>{f.hips_cm ? `${Number(f.hips_cm)} سم` : "—"} {delta(f.hips_cm, prev?.hips_cm ?? null, "سم")}</dd></div>
          {first && first.weight_kg && f.weight_kg ? <div><dt>من البداية</dt><dd>{delta(f.weight_kg, first.weight_kg, "كجم")}</dd></div> : null}
          <div><dt>👟 الخطوات</dt><dd>{f.steps_count ? f.steps_count.toLocaleString("en-US") : "—"}</dd></div>
          <div><dt>😴 النوم</dt><dd>{f.sleep_hours ? `${Number(f.sleep_hours)} ساعات` : "—"}</dd></div>
          <div><dt>🩸 الدورة</dt><dd>{f.menstrual_cycle || "—"}</dd></div>
        </dl>
        {prev ? <p className="note">الفرق مقارنة بمتابعتها اللي قبل ({dayName(prev.week_date)}).</p> : null}
      </section>

      {f.changes_requested ? (
        <div className="tip-card"><span className="em" aria-hidden="true">✏️</span><span><b>تبي تعديلات للأسبوع الجاي:</b><br />{f.changes_requested}</span></div>
      ) : null}
      {f.client_notes ? (
        <section className="card"><b>💭 ملاحظاتها</b><p className="small" style={{ whiteSpace: "pre-line", marginTop: 4 }}>{f.client_notes}</p></section>
      ) : null}

      {nowPics.length ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">📸</span>
            <h2>صورها</h2>
            {firstPics.length ? <span className="aside">مقارنة بأول متابعة</span> : null}
          </div>
          <section className="card stack">
            {TYPES.map(([t, l]) => {
              const now = nowPics.find((p) => p.photo_type === t);
              if (!now?.url) return null;
              const was = firstPics.find((p) => p.photo_type === t);
              return (
                <div key={t} className="stack" style={{ gap: 6 }}>
                  <b className="small">{l}</b>
                  <div className="grid2">
                    {was?.url ? <figure style={{ margin: 0 }}><img src={was.url} alt={`${l} أول متابعة`} className="cmp-img" /><figcaption className="note">البداية</figcaption></figure> : null}
                    <figure style={{ margin: 0 }}><a href={now.url} target="_blank" rel="noreferrer"><img src={now.url} alt={`${l} هالأسبوع`} className="cmp-img" /></a><figcaption className="note">هالأسبوع</figcaption></figure>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      ) : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">💬</span>
        <h2>ردك</h2>
        {f.coach_replied_at ? <span className="aside">أرسلتيه {formatDate(f.coach_replied_at)}</span> : null}
      </div>
      <form className="card stack" onSubmit={send}>
        <textarea className="inp" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="شجعيها، وقولي لها وش بتعدلين في خطتها للأسبوع الجاي..." aria-label="ردك" />
        <button className="btn btn-p" type="submit" disabled={busy || !reply.trim() || reply.trim() === (f.coach_notes || "")}>{busy ? "لحظة..." : f.coach_notes ? "حدّثي الرد" : "📤 أرسلي ردك"}</button>
        <p className="note">لو تبين تعدلين خطتها، افتحي <Link className="link" href={`/coach/subscribers/${client.id}`}>صفحتها</Link> ثم طلبها وولّدي جدول جديد.</p>
      </form>
      {toast.node}
    </CoachShell>
  );
}
