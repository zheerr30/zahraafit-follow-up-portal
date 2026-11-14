"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { aiRead } from "@/lib/food-scan";
import { ShareSheet } from "@/components/ShareSheet";
import type { ShareCard } from "@/lib/share-card";

/** Live camera barcode reader, with typing the number as a fallback. */
export function BarcodeScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let stop: (() => void) | null = null;
    let done = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]);
        const reader = new BrowserMultiFormatReader(hints);
        if (!video.current) return;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (result, _e, ctrl) => {
          if (result && !done) {
            const code = result.getText().replace(/\D/g, "");
            if (code.length < 6 || code.length > 14) return;
            done = true;
            ctrl.stop();
            if (navigator.vibrate) navigator.vibrate(60);
            onCode(code);
          }
        });
        stop = () => controls.stop();
        if (done) controls.stop();
      } catch {
        setErr("ما قدرنا نفتح الكاميرا. اسمحي للموقع يستخدم الكاميرا من إعدادات الجوال، أو اكتبي رقم الباركود تحت.");
      }
    })();
    return () => {
      done = true;
      stop?.();
    };
  }, [onCode]);

  return (
    <div className="stack">
      {err ? <p className="alert err">{err}</p> : (
        <div className="scan-box">
          <video ref={video} muted playsInline aria-label="الكاميرا" />
          <span className="scan-line" aria-hidden="true" />
        </div>
      )}
      <p className="note" style={{ textAlign: "center" }}>وجهي الكاميرا على الباركود وانتظري ثانية.</p>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); const c = typed.replace(/\D/g, ""); if (c.length >= 6 && c.length <= 14) onCode(c); }}>
        <label htmlFor="bc-typed" className="sr-only">رقم الباركود</label>
        <input id="bc-typed" className="inp num" dir="ltr" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="أو اكتبي رقم الباركود" style={{ flex: 1 }} />
        <button className="btn btn-s" type="submit" disabled={typed.replace(/\D/g, "").length < 6}>بحث</button>
      </form>
      <button type="button" className="btn btn-g" onClick={onCancel}>رجوع</button>
    </div>
  );
}

type AiItem = { name: string; grams: number; cal: number; p: number; c: number; f: number };
type Row = AiItem & { on: boolean; g: string };

/** Photo of a meal → AI estimate she reviews before adding. */
export function MealPhoto({ onAdd, onCancel, textOnly = false }: { onAdd: (items: { name: string; amount: number; unit: string; cal: number; p: number; c: number; f: number }[]) => void; onCancel: () => void; textOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [share, setShare] = useState<ShareCard | null>(null);

  const [desc, setDesc] = useState("");

  function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setPreview(URL.createObjectURL(file));
    setPhoto(file);
  }

  /** Sends the photo with her description (or the description alone) and lists what was found. */
  async function read() {
    if (!photo && !desc.trim()) return setErr(textOnly ? "اكتبي وش أكلتي" : "صوري صحنك أو اختاري صورة");
    setBusy(true);
    setErr(null);
    const { data, error } = await aiRead<{ items: AiItem[]; note: string | null }>("meal", textOnly ? null : photo, desc.trim() || undefined);
    setBusy(false);
    if (error || !data) return setErr(error || "ما قدرنا نقرأ الصورة.");
    setNote(data.note);
    setRows((data.items || []).filter((x) => x.name && x.grams > 0).map((x) => ({ ...x, on: true, g: String(Math.round(x.grams)) })));
  }

  const scaled = (r: Row) => {
    const k = (Number(r.g) || 0) / (r.grams || 1);
    const v = (n: number) => Math.round(n * k * 10) / 10;
    return { cal: Math.round(r.cal * k), p: v(r.p), c: v(r.c), f: v(r.f) };
  };
  const chosen = (rows || []).filter((r) => r.on && Number(r.g) > 0);
  const total = chosen.reduce((a, r) => a + scaled(r).cal, 0);

  return (
    <div className="stack">
      {preview ? <img src={preview} alt="صورة وجبتك" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 14 }} /> : null}
      {!rows ? (
        <>
          {textOnly ? (
            <p className="small muted">اكتبي وش أكلتي بكلامك، والكمية لو تعرفينها، ونحسب لك السعرات تقريبا. بعدها تراجعين الكميات قبل ما تضيفينها.</p>
          ) : (
            <>
              <p className="small muted">صوري صحنك من فوق وكل الأكل باين، أو اختاري صورة من الصور. ولو تبين، اكتبي وصف يساعدنا نعرف الأكل والكمية.</p>
              <div className="photo-pick-row">
                <label className="btn btn-s" style={{ cursor: busy ? "wait" : "pointer" }}>
                  <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
                  <Camera size={18} />
                  {preview ? "صوري مرة ثانية" : "صوري الحين"}
                </label>
                <label className="btn btn-s" style={{ cursor: busy ? "wait" : "pointer" }}>
                  <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
                  <ImageIcon size={18} />
                  من الصور
                </label>
              </div>
            </>
          )}
          <label className="field">
            <span className="label">{textOnly ? "وش أكلتي؟" : "وصف (اختياري)"}</span>
            <textarea className="inp" rows={textOnly ? 4 : 2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder={textOnly ? "مثلا: نص صحن كبسة دجاج، صدر بدون جلد، وسلطة ولبن" : "مثلا: الرز نص كوب، والدجاج صدر مشوي بدون زيت"} />
          </label>
          <button type="button" className="btn btn-p" disabled={busy || (textOnly ? !desc.trim() : !photo)} onClick={read}>
            {busy ? "لحظة... نحسب" : "احسبي السعرات"}
          </button>
        </>
      ) : rows.length ? (
        <>
          <div className="alert info"><b>هذا تقدير تقريبي.</b> لو تعرفين الكمية، عدلي الغرامات قبل الحفظ، والسعرات تتعدل معها.</div>
          {rows.map((r, i) => (
            <div key={i} className="diary-row" style={{ opacity: r.on ? 1 : 0.45 }}>
              <input type="checkbox" checked={r.on} aria-label={`احسبي ${r.name}`} onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} style={{ width: 20, height: 20, accentColor: "var(--clay)", flex: "none" }} />
              <span style={{ minWidth: 0 }}>
                {r.name}
                <span className="note" style={{ display: "block" }}><MacLine p={scaled(r).p} c={scaled(r).c} f={scaled(r).f} /></span>
              </span>
              <input className="inp num" inputMode="numeric" aria-label={`جرامات ${r.name}`} value={r.g} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, g: e.target.value.replace(/\D/g, "") } : x)))} style={{ width: 66, minHeight: 38, padding: "0 8px", flex: "none" }} />
              <span className="note" style={{ flex: "none" }}>غ</span>
              <b className="num" style={{ minWidth: 36, textAlign: "end" }}>{scaled(r).cal}</b>
            </div>
          ))}
          {note ? <p className="note">{note}</p> : null}
          <p className="note">الأرقام تقريبية، والزيت والصوصات المخفية ممكن تزيدها.</p>
          <button type="button" className="btn btn-p" disabled={!chosen.length} onClick={() => onAdd(chosen.map((r) => ({ name: r.name, amount: Number(r.g), unit: "غ", ...scaled(r) })))}>
            أضيفيها ({total} سعرة)
          </button>
          {photo && !textOnly ? <button type="button" className="btn btn-s" disabled={!chosen.length} onClick={() => {
            const sum = chosen.reduce((a, r) => { const v = scaled(r); return { cal: a.cal + v.cal, p: a.p + v.p, c: a.c + v.c, f: a.f + v.f }; }, { cal: 0, p: 0, c: 0, f: 0 });
            setShare({ kind: "meal", photo, name: chosen.map((r) => r.name).slice(0, 3).join(" و"), ...sum });
          }}>شاركي صحنك</button> : null}
        </>
      ) : (
        <p className="alert info">{note || (textOnly ? "ما فهمنا الأكل. اكتبيه بشكل أوضح." : "ما لقينا أكل في الصورة. جربي صورة أوضح.")}</p>
      )}
      {err ? <p className="alert err">{err}</p> : null}
      <button type="button" className="btn btn-g" onClick={onCancel}>رجوع</button>
      {share ? <ShareSheet card={share} onClose={() => setShare(null)} /> : null}
    </div>
  );
}
