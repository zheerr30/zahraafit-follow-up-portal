"use client";

import { useState } from "react";
import { PlayCircle, X } from "lucide-react";
import { MuscleMap } from "@/components/MuscleMap";
import { InlineVideo } from "@/components/VideoSheet";
import { mediaFor, mediaSrc } from "@/lib/exercise-media";
import { formatDate } from "@/lib/format";
import { muscleImage, type Exercise } from "@/lib/plan-data";
import { SECONDARY } from "@/lib/share-card";

type Log = { id: string; created_at: string; items: { id: string; name: string; sets: { w: number; r: number }[] }[] };

/** Tap an exercise: animation, muscles, steps (about), every time she did it (history), and her best weight over time (progress). */
export function ExerciseSheet({ ex, logs, female, onClose }: { ex: Exercise; logs: Log[]; female: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"about" | "log" | "progress">("about");
  const [yt, setYt] = useState(false);
  const media = mediaFor(ex.id);
  const primary = ex.primary?.length ? ex.primary : ex.muscle ? [ex.muscle] : [];
  const secondary = ex.secondary?.length ? ex.secondary : SECONDARY[ex.muscle] || [];
  const history = logs
    .map((l) => ({ at: l.created_at, sets: (l.items || []).find((it) => it.id === ex.id || it.name === ex.name)?.sets || [] }))
    .filter((h) => h.sets.length)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const best = [...history].reverse().map((h) => ({ at: h.at, w: Math.max(...h.sets.map((s) => Number(s.w) || 0)) })).filter((x) => x.w > 0);
  const top = Math.max(1, ...best.map((b) => b.w));

  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet ex-sheet" role="dialog" aria-modal="true" aria-label={ex.name}>
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18 }}>{ex.name}</h2>
            {ex.en ? <span className="small muted" dir="ltr">{ex.en}</span> : null}
          </div>
          <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><X /></button>
        </div>
        <div className="seg-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "about"} onClick={() => setTab("about")}>عن التمرين</button>
          <button type="button" role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>السجل</button>
          <button type="button" role="tab" aria-selected={tab === "progress"} onClick={() => setTab("progress")}>التقدم</button>
        </div>

        {tab === "about" ? (
          <>
            {media ? (
              <video className="ex-video" src={`${mediaSrc(media, female)}.mp4`} poster={`${mediaSrc(media, female)}.jpg`} autoPlay muted loop playsInline aria-label={`طريقة أداء ${ex.name}`} />
            ) : (
              <div className="ex-video ex-video-soon">
                {muscleImage(ex.muscle) ? <img src={muscleImage(ex.muscle)!} alt="" /> : null}
                <span>فيديو الأداء بينضاف هنا قريب</span>
              </div>
            )}
            {ex.video ? (
              yt ? <InlineVideo url={ex.video} title={ex.name} /> : (
                <button type="button" className="btn btn-s btn-block yt-extra" onClick={() => setYt(true)}><PlayCircle size={18} />شاهدي الفيديو في يوتيوب</button>
              )
            ) : null}
            {media?.desc ? <p className="small" style={{ margin: 0, lineHeight: 1.8 }}>{media.desc}</p> : null}
            <b className="ex-h">العضلات المستهدفة</b>
            <MuscleMap primary={primary} secondary={secondary} />
            {media?.steps.length ? (
              <>
                <b className="ex-h">الخطوات</b>
                <ol className="recs-list">{media.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </>
            ) : null}
            {ex.tip ? <div className="tip-card"><span className="em" aria-hidden="true">💡</span><span><b>نصيحة المدربة:</b> {ex.tip}</span></div> : null}
            {ex.alt ? <p className="note">↔ البديل لو الجهاز مشغول: <b>{ex.alt.name}</b></p> : null}
          </>
        ) : tab === "log" ? (
          history.length ? (
            <div className="stack" style={{ gap: 0 }}>
              {history.map((h) => (
                <div key={h.at} className="diary-row">
                  <span className="small muted" style={{ flex: "none", minWidth: 96 }}>{formatDate(h.at)}</span>
                  <span className="num small" dir="ltr" style={{ textAlign: "end" }}>{h.sets.map((s) => `${s.w}kg × ${s.r}`).join(" · ")}</span>
                </div>
              ))}
            </div>
          ) : <p className="note">لما تسوين هالتمرين، كل مرة تنحفظ هنا بأوزانها وتكراراتها.</p>
        ) : best.length > 1 ? (
          <div className="ex-prog" role="img" aria-label={`أعلى وزن من ${best[0].w} إلى ${best[best.length - 1].w} كجم`}>
            {best.slice(-12).map((b) => (
              <div key={b.at}>
                <small className="num">{b.w}</small>
                <i style={{ height: `${(b.w / top) * 100}%` }} />
                <small className="num">{new Date(b.at).getDate()}/{new Date(b.at).getMonth() + 1}</small>
              </div>
            ))}
          </div>
        ) : <p className="note">سجلي هالتمرين مرتين على الأقل، ويطلع لك رسم تطور أعلى وزن.</p>}
      </div>
    </div>
  );
}
