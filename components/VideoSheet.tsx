"use client";

import { X } from "lucide-react";

/** The YouTube id in a youtu.be / youtube.com/watch / shorts / embed link (null if it isn't YouTube). */
export function ytId(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\.|^m\./, "");
    if (h === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (h === "youtube.com" || h === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
      return m ? m[1] : null;
    }
  } catch {}
  return null;
}

/** The video inside the app (no trip to YouTube). */
export function InlineVideo({ url, title }: { url: string; title: string }) {
  const id = ytId(url);
  if (!id) return null;
  return (
    <div className="yt-frame">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`}
        title={`فيديو ${title}`}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

/** A sheet with the exercise video, opened from the play buttons. */
export function VideoSheet({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const inApp = Boolean(ytId(url));
  return (
    <div className="sheet-bg" style={{ zIndex: 95 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`فيديو ${title}`}>
        <div className="row between">
          <h2 style={{ fontSize: 17 }}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><X /></button>
        </div>
        {inApp ? <InlineVideo url={url} title={title} /> : <a className="btn btn-s btn-block" href={url} target="_blank" rel="noreferrer">افتحي الفيديو</a>}
      </div>
    </div>
  );
}
