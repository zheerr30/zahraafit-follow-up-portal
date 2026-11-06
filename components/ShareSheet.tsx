"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  DESIGN_LABEL, TOGGLE_LABEL, canCopyImage, cardSetup, compose, copyImage, downloadImage, drawCard, shareImage, toPng,
  type Bg, type Ink, type Place, type ShareCard, type Toggle
} from "@/lib/share-card";

const BG_LABEL: Record<Bg, string> = { clear: "شفافة", navy: "كحلي", photo: "صورتي" };

/** Loads a picked photo, shrunk so the phone doesn't run out of memory. */
function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * s);
      cv.height = Math.round(img.naturalHeight * s);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(cv);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("photo"));
    };
    img.src = url;
  });
}

/**
 * Share editor: background (transparent sticker, brand navy, or her own photo with the
 * card dragged and pinched into place), design (swipe), text color, and what to show.
 * Everything is drawn on the phone; nothing is uploaded.
 */
export function ShareSheet({ card, onClose }: { card: ShareCard; onClose: () => void }) {
  const setup = cardSetup(card);
  const [di, setDi] = useState(0);
  const [bg, setBg] = useState<Bg>("navy");
  const [ink, setInk] = useState<Ink>("white");
  const [show, setShow] = useState<Record<Toggle, boolean>>(() => {
    const o = { cal: false, macros: false, water: false, meals: false, streak: false, weight: false };
    setup.on.forEach((t) => (o[t] = true));
    // switches this card doesn't offer stay on, so its own content still shows
    (Object.keys(o) as Toggle[]).forEach((t) => { if (!setup.toggles.includes(t)) o[t] = true; });
    return o;
  });
  const [link, setLink] = useState(true);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [place, setPlace] = useState<Place>({ x: 0.5, y: 0.6, s: 0.85 });
  const [cardCv, setCardCv] = useState<HTMLCanvasElement | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const design = setup.designs[di] || setup.designs[0];
  const effInk: Ink = bg === "navy" ? "white" : ink;
  const effBg: Bg = bg === "photo" && !photo ? "navy" : bg;

  useEffect(() => {
    let alive = true;
    drawCard(card, { design, ink: effInk, show, link: effBg === "clear" ? link : true }, effBg === "photo").then((c) => alive && setCardCv(c));
    return () => {
      alive = false;
    };
  }, [card, design, effInk, show, link, effBg]);

  useEffect(() => {
    if (!cardCv || !preview.current) return;
    const id = requestAnimationFrame(() => {
      const out = compose(cardCv, effBg, photo, place);
      const pv = preview.current!;
      pv.width = out.width;
      pv.height = out.height;
      pv.getContext("2d")!.drawImage(out, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [cardCv, effBg, photo, place]);

  // Drag and pinch the card on her photo; swipe to change the design otherwise.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; d: number; place: Place } | null>(null);
  function down(e: RPointerEvent<HTMLCanvasElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pts.current.values()];
    start.current = { x: e.clientX, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, place };
  }
  function move(e: RPointerEvent<HTMLCanvasElement>) {
    const prev = pts.current.get(e.pointerId);
    if (!prev || effBg !== "photo") return;
    const r = e.currentTarget.getBoundingClientRect();
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pts.current.values()];
    if (ps.length > 1 && start.current?.d) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      setPlace((p) => ({ ...p, s: Math.max(0.3, Math.min(1.2, start.current!.place.s * (d / start.current!.d))) }));
    } else {
      const dx = (e.clientX - prev.x) / r.width, dy = (e.clientY - prev.y) / r.height;
      setPlace((p) => ({ ...p, x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) }));
    }
  }
  function up(e: RPointerEvent<HTMLCanvasElement>) {
    pts.current.delete(e.pointerId);
    if (effBg !== "photo" && start.current && setup.designs.length > 1) {
      const dx = e.clientX - start.current.x;
      if (Math.abs(dx) > 50) setDi((i) => (i + (dx < 0 ? 1 : -1) + setup.designs.length) % setup.designs.length);
    }
    if (!pts.current.size) start.current = null;
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    try {
      setPhoto(await loadPhoto(f));
      setBg("photo");
      setPlace({ x: 0.5, y: 0.6, s: 0.85 });
    } catch {
      setMsg("ما قدرنا نفتح الصورة. جربي صورة ثانية.");
    }
  }

  const blob = () => (cardCv ? toPng(compose(cardCv, effBg, photo, place)) : Promise.reject(new Error("not ready")));
  async function doShare() {
    setBusy(true);
    const r = await shareImage(await blob());
    setBusy(false);
    if (r === "downloaded") setMsg("انحفظت الصورة في جهازك، شاركيها من الاستوديو.");
    if (r === "shared") onClose();
  }
  async function doSave() {
    downloadImage(await blob());
    setMsg("انحفظت الصورة. لو ما لقيتيها في الصور، شوفيها في الملفات أو التنزيلات.");
  }
  async function doCopy() {
    const ok = await copyImage(blob());
    setMsg(ok ? "انسخت ✅ افتحي الستوري واضغطي «لصق» وتطلع كستيكر." : "جوالك ما يدعم النسخ، استخدمي «احفظي بالصور».");
  }

  const seg = <T extends string>(val: T, opts: T[], label: (v: T) => string, set: (v: T) => void, aria: string) => (
    <div className="seg-tabs" role="tablist" aria-label={aria}>
      {opts.map((o) => <button key={o} type="button" role="tab" aria-selected={val === o} onClick={() => set(o)}>{label(o)}</button>)}
    </div>
  );

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet share-ed" role="dialog" aria-modal="true" aria-label="شاركي" style={{ maxHeight: "94vh", overflowY: "auto" }}>
        <div className="row between">
          <h2 style={{ fontSize: 18 }}>📤 شاركي</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><X /></button>
        </div>

        <div className={`share-stage ${effBg === "clear" ? "checker" : ""}`}>
          <canvas ref={preview} className={`share-canvas ${effBg === "clear" ? "wide" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={{ touchAction: effBg === "photo" || setup.designs.length > 1 ? "none" : "auto", cursor: effBg === "photo" ? "grab" : undefined }}
            role="img" aria-label="الصورة اللي بتنشارك" />
          {setup.designs.length > 1 ? (
            <div className="share-designs">
              <button type="button" className="icon-btn" aria-label="التصميم اللي قبل" onClick={() => setDi((i) => (i - 1 + setup.designs.length) % setup.designs.length)}><ChevronRight /></button>
              <span className="small"><b>{DESIGN_LABEL[design]}</b> · {di + 1}/{setup.designs.length}</span>
              <button type="button" className="icon-btn" aria-label="التصميم اللي بعد" onClick={() => setDi((i) => (i + 1) % setup.designs.length)}><ChevronLeft /></button>
            </div>
          ) : null}
        </div>
        {effBg === "photo" ? <p className="note" style={{ textAlign: "center" }}>اسحبي البطاقة بإصبع، وكبريها أو صغريها بإصبعين.</p> : setup.designs.length > 1 ? <p className="note" style={{ textAlign: "center" }}>اسحبي يمين أو يسار عشان تغيرين التصميم.</p> : null}

        <span className="label">الخلفية</span>
        {seg(bg, ["clear", "navy", "photo"] as Bg[], (v) => BG_LABEL[v], (v) => { setBg(v); if (v === "photo" && !photo) albumRef.current?.click(); }, "الخلفية")}
        {bg === "photo" ? (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-s" style={{ flex: 1 }} onClick={() => camRef.current?.click()}>📷 الكاميرا</button>
              <button type="button" className="btn btn-s" style={{ flex: 1 }} onClick={() => albumRef.current?.click()}>🖼️ الألبوم</button>
            </div>
            {photo ? (
              <label className="row" style={{ gap: 10 }}>
                <span className="small" style={{ flex: "none" }}>حجم البطاقة</span>
                <input type="range" min={30} max={120} value={Math.round(place.s * 100)} onChange={(e) => setPlace({ ...place, s: Number(e.target.value) / 100 })} style={{ flex: 1, accentColor: "var(--clay)" }} />
              </label>
            ) : null}
          </>
        ) : null}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={albumRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />

        {bg !== "navy" ? (
          <>
            <span className="label">لون النص</span>
            {seg(ink, ["white", "navy"] as Ink[], (v) => (v === "white" ? "أبيض (للصور الغامقة)" : "كحلي (للصور الفاتحة)"), setInk, "لون النص")}
          </>
        ) : null}

        {setup.toggles.length ? (
          <>
            <span className="label">وش يطلع في الصورة</span>
            <div className="chip-toggles">
              {setup.toggles.map((t) => (
                <button key={t} type="button" aria-pressed={show[t]} onClick={() => setShow({ ...show, [t]: !show[t] })}>{show[t] ? "✓ " : ""}{TOGGLE_LABEL[t]}</button>
              ))}
            </div>
          </>
        ) : null}
        {effBg === "clear" ? (
          <label className="row between" style={{ cursor: "pointer" }}>
            <span className="small">رابط التطبيق تحت</span>
            <input type="checkbox" checked={link} onChange={() => setLink(!link)} style={{ width: 22, height: 22, accentColor: "var(--clay)" }} />
          </label>
        ) : null}

        <button type="button" className="btn btn-p btn-block" disabled={!cardCv || busy} onClick={doShare}>📤 شاركي</button>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-s" style={{ flex: 1 }} disabled={!cardCv} onClick={doSave}>💾 احفظي بالصور</button>
          {canCopyImage() ? <button type="button" className="btn btn-s" style={{ flex: 1 }} disabled={!cardCv} onClick={doCopy}>📋 انسخي كستيكر</button> : null}
        </div>
        {msg ? <p className="alert info" role="status">{msg}</p> : <p className="note">الصورة تنعمل في جوالك وما تنرفع لأي مكان.</p>}
      </div>
    </div>
  );
}
