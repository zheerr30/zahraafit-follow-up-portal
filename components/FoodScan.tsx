"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { aiRead } from "@/lib/food-scan";

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
      <p className="note" style={{ textAlign: "center" }}>وجّهي الكاميرا على الباركود وانتظري ثانية.</p>
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
export function MealPhoto({ onAdd, onCancel }: { onAdd: (items: { name: string; amount: number; unit: string; cal: number; p: number; c: number; f: number }[]) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setPreview(URL.createObjectURL(file));
    const { data, error } = await aiRead<{ items: AiItem[]; note: string | null }>("meal", file);
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
          <p className="small muted">صوّري صحنك من فوق وكل الأكل باين، ونقدّر لك السعرات تقريبًا. بعدها تراجعين الكميات قبل ما تضيفينها.</p>
          <label className="btn btn-p" style={{ cursor: busy ? "wait" : "pointer" }}>
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
            <Camera size={18} />
            {busy ? "لحظة... نقرأ صحنك 🔍" : preview ? "صوّري مرة ثانية" : "📸 صوّري وجبتك"}
          </label>
        </>
      ) : rows.length ? (
        <>
          <p className="small"><b>🤖 هذا تقديرنا</b>، عدلي الجرامات لو تعرفين أكثر:</p>
          {rows.map((r, i) => (
            <div key={i} className="diary-row" style={{ opacity: r.on ? 1 : 0.45 }}>
              <input type="checkbox" checked={r.on} aria-label={`احسبي ${r.name}`} onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} style={{ width: 20, height: 20, accentColor: "var(--clay)", flex: "none" }} />
              <span style={{ minWidth: 0 }}>
                {r.name}
                <span className="note" style={{ display: "block" }}>💪 {scaled(r).p} · 🌾 {scaled(r).c} · 🫒 {scaled(r).f}</span>
              </span>
              <input className="inp num" inputMode="numeric" aria-label={`جرامات ${r.name}`} value={r.g} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, g: e.target.value.replace(/\D/g, "") } : x)))} style={{ width: 66, minHeight: 38, padding: "0 8px", flex: "none" }} />
              <span className="note" style={{ flex: "none" }}>جم</span>
              <b className="num" style={{ minWidth: 36, textAlign: "end" }}>{scaled(r).cal}</b>
            </div>
          ))}
          {note ? <p className="note">💡 {note}</p> : null}
          <p className="note">الأرقام تقريبية من الصورة، والزيت والصوصات المخفية ممكن تزيدها.</p>
          <button type="button" className="btn btn-p" disabled={!chosen.length} onClick={() => onAdd(chosen.map((r) => ({ name: `${r.name} 📸`, amount: Number(r.g), unit: "جرام", ...scaled(r) })))}>
            أضيفيها ({total} سعرة)
          </button>
        </>
      ) : (
        <p className="alert info">{note || "ما لقينا أكل في الصورة. جربي صورة أوضح."}</p>
      )}
      {err ? <p className="alert err">{err}</p> : null}
      <button type="button" className="btn btn-g" onClick={onCancel}>رجوع</button>
    </div>
  );
}
