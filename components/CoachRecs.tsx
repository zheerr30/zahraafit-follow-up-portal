"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type Rec = { id: string; profile_id: string; week_end: string; recs: string[]; status: string };

/** «المتابعات»: Friday tips — publish automatically, or review them first. */
export function CoachRecs({ names }: { names: Map<string, string> }) {
  const [review, setReview] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Rec[]>([]);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    const [{ data: st, error }, { data: r }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "weekly_recs_review").maybeSingle(),
      supabase.from("weekly_recs").select("id, profile_id, week_end, recs, status").eq("status", "pending").order("created_at", { ascending: true })
    ]);
    if (error) return setReview(null);
    setReview(st?.value === true);
    setPending((r as Rec[] | null) || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function setMode(v: boolean) {
    const { error } = await supabase.from("app_settings").upsert({ key: "weekly_recs_review", value: v, updated_at: new Date().toISOString() });
    if (!error) setReview(v);
  }

  async function decide(r: Rec, publish: boolean) {
    const recs = (edits[r.id] || r.recs).map((x) => x.trim()).filter(Boolean).slice(0, 3);
    if (publish && !recs.length) return setMsg("اكتبي توصية وحدة على الأقل");
    const { error } = await supabase.from("weekly_recs").update({ status: publish ? "published" : "rejected", recs: recs.length ? recs : r.recs, reviewed_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return setMsg("ما انحفظ، جربي مرة ثانية");
    setMsg(publish ? "انرسلت ✅" : "ما بتطلع لها");
    setPending((p) => p.filter((x) => x.id !== r.id));
  }

  if (review === null) return null;
  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">💡</span>
        <h2>توصيات الجمعة</h2>
        <span className="aside">{pending.length || ""}</span>
      </div>
      <section className="card stack">
        <p className="small muted">كل جمعة يطلع لكل مشتركة ٢-٣ توصيات قصيرة من أرقام أسبوعها (بدون تغيير سعرات أو خطة أو كلام طبي). وتنكتب بحيث ما تعارض آخر ملاحظة منك.</p>
        <div className="seg-tabs" role="tablist" aria-label="طريقة النشر">
          <button type="button" role="tab" aria-selected={!review} onClick={() => setMode(false)}>تنزل لها مباشرة</button>
          <button type="button" role="tab" aria-selected={review} onClick={() => setMode(true)}>أراجعها قبل</button>
        </div>
        {review && !pending.length ? <p className="note">ما فيه توصيات تنتظر مراجعتك.</p> : null}
        {msg ? <p className="note" role="status">{msg}</p> : null}
      </section>
      {pending.map((r) => {
        const list = edits[r.id] || r.recs;
        return (
          <section key={r.id} className="card stack">
            <b>{names.get(r.profile_id) || "مشتركة"} <span className="small muted">· جمعة {formatDate(r.week_end)}</span></b>
            {list.map((x, i) => (
              <textarea key={i} className="inp" rows={3} value={x} aria-label={`توصية ${i + 1}`} onChange={(e) => setEdits({ ...edits, [r.id]: list.map((y, j) => (j === i ? e.target.value : y)) })} />
            ))}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-p" onClick={() => decide(r, true)}>انشريها</button>
              <button type="button" className="btn btn-g" onClick={() => decide(r, false)}>لا تنشريها</button>
            </div>
          </section>
        );
      })}
    </>
  );
}
