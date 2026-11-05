"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomFood } from "@/lib/foods";

type Draft = { name: string; label: string; cal: string; p: string; c: string; f: string };
const EMPTY: Draft = { name: "", label: "صحن", cal: "", p: "", c: "", f: "" };

/** Coach: ready dishes everyone can find in the food diary (kabsa, shawarma, restaurant meals). */
export function CoachDishes() {
  const [list, setList] = useState<CustomFood[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("foods").select("*").is("owner_id", null).order("name").then(({ data, error }) => setList(error ? [] : ((data as CustomFood[] | null) || [])));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !draft.name.trim() || !Number(draft.cal)) return setErr("اكتبي الاسم والسعرات على الأقل.");
    setBusy(true);
    const { data, error } = await supabase
      .from("foods")
      .insert({ owner_id: null, name: draft.name.trim(), basis: "serving", serving_label: draft.label.trim() || "حصة", cal: Number(draft.cal), p: Number(draft.p) || 0, c: Number(draft.c) || 0, f: Number(draft.f) || 0 })
      .select("*")
      .single();
    setBusy(false);
    if (error || !data) return setErr(error?.code === "42P01" ? "شغلي ملف phase5-food-diary.sql في Supabase أول." : "ما انحفظ. تأكدي إن الأرقام معقولة.");
    setList((cur) => [...(cur || []), data as CustomFood].sort((a, b) => a.name.localeCompare(b.name, "ar")));
    setDraft(null);
    setErr(null);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("foods").delete().eq("id", id);
    if (!error) setList((cur) => (cur || []).filter((x) => x.id !== id));
  }

  const num = (k: "cal" | "p" | "c" | "f", label: string) => (
    <div className="field">
      <label htmlFor={`d-${k}`}>{label}</label>
      <input id={`d-${k}`} className="inp num" inputMode="decimal" value={draft![k]} onChange={(e) => setDraft({ ...draft!, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
    </div>
  );

  return (
    <>
      <div className="sec-title" style={{ marginTop: 14 }}>
        <span className="em" aria-hidden="true">🍲</span>
        <h2>أكلات جاهزة</h2>
        <button type="button" className="btn btn-p btn-sm" style={{ marginInlineStart: "auto" }} onClick={() => { setDraft({ ...EMPTY }); setErr(null); }}>
          <Plus size={16} />
          أكلة جديدة
        </button>
      </div>
      <p className="small muted">أكلات تلقاها كل المشتركات في «يومياتي» لما يبحثون، مثل الكبسة والشاورما وأكلات المطاعم. أصناف مولدك موجودة تلقائي.</p>

      {draft ? (
        <form className="card stack" onSubmit={save}>
          <div className="row between">
            <b>أكلة جديدة</b>
            <button type="button" className="icon-btn" aria-label="إلغاء" onClick={() => setDraft(null)}><X size={16} /></button>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="d-name">الاسم</label>
              <input id="d-name" className="inp" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="كبسة دجاج" />
            </div>
            <div className="field">
              <label htmlFor="d-label">الحصة</label>
              <input id="d-label" className="inp" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="صحن، ساندويتش، قطعة" />
            </div>
          </div>
          <div className="grid2" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {num("cal", "🔥 سعرات")}
            {num("p", "💪 بروتين")}
            {num("c", "🌾 كارب")}
            {num("f", "🫒 دهون")}
          </div>
          {err ? <p className="alert err">{err}</p> : null}
          <button className="btn btn-p" type="submit" disabled={busy}>{busy ? "لحظة..." : "احفظي"}</button>
        </form>
      ) : null}

      {list === null ? null : list.length ? (
        <section className="card" style={{ padding: "4px 16px" }}>
          {list.map((x) => (
            <div key={x.id} className="diary-row">
              <span style={{ minWidth: 0 }}>
                {x.name}
                <span className="note" style={{ display: "block" }}>لكل {x.serving_label || "حصة"} · 💪 {Number(x.p)} · 🌾 {Number(x.c)} · 🫒 {Number(x.f)}</span>
              </span>
              <b className="num">{Number(x.cal)}</b>
              <button type="button" className="icon-btn" aria-label={`احذفي ${x.name}`} onClick={() => remove(x.id)}><Trash2 size={16} /></button>
            </div>
          ))}
        </section>
      ) : (
        <p className="note">ما أضفتي أكلات للحين.</p>
      )}
    </>
  );
}
