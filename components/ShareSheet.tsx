"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { drawShareCard, shareImage, type ShareCard } from "@/lib/share-card";

/** Preview of a share image and the button that opens the phone's share sheet. */
export function ShareSheet({ card, onClose, numberToggle, toggleLabel }: { card: ShareCard; onClose: () => void; numberToggle?: boolean; toggleLabel?: string }) {
  const [show, setShow] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const c: ShareCard = card.kind === "weight" || card.kind === "week" || card.kind === "rings" ? { ...card, show } : card;
    drawShareCard(c).then((b) => {
      if (!alive) return;
      setBlob(b);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
    });
    return () => {
      alive = false;
    };
  }, [card, show]);

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="شاركي" style={{ maxHeight: "92vh", overflowY: "auto" }}>
        <div className="row between">
          <h2 style={{ fontSize: 18 }}>📤 شاركي</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><X /></button>
        </div>
        <div className="share-preview">{url ? <img src={url} alt="الصورة اللي بتنشارك" /> : <span className="note">لحظة...</span>}</div>
        {numberToggle ? (
          <label className="row between" style={{ cursor: "pointer" }}>
            <span className="small">{toggleLabel || "أظهري الرقم في الصورة"}</span>
            <input type="checkbox" checked={show} onChange={() => setShow(!show)} style={{ width: 22, height: 22, accentColor: "var(--clay)" }} />
          </label>
        ) : null}
        <button type="button" className="btn btn-p btn-block" disabled={!blob} onClick={async () => {
          const r = await shareImage(blob!);
          if (r === "downloaded") setMsg("انحفظت الصورة في جهازك، شاركيها من الاستوديو.");
          if (r === "shared") onClose();
        }}>📤 شاركي (سناب، انستقرام، واتساب...)</button>
        {msg ? <p className="alert info">{msg}</p> : <p className="note">الصورة تنعمل في جوالك وما تنرفع لأي مكان.</p>}
      </div>
    </div>
  );
}
