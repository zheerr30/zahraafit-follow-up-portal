"use client";

import { useEffect, useState } from "react";

const SEEN = "zf-intro-v1";
const IOS_SEEN = "zf-ios-guide-v1";

const SLIDES = [
  { em: "🔥", t: "سعراتك بضغطة", d: "امسحي الباركود، صوري صحنك، أو اختاري من المطاعم، والتطبيق يحسب لك." },
  { em: "🍽️", t: "خطتك وتمارينك معك", d: "وجباتك وتمارينك من المدربة زهراء، وتعلمين على اللي خلصتيه أول بأول." },
  { em: "📈", t: "شوفي تقدمك وشاركيه", d: "وزنك وقياساتك وأيام التزامك، وتسجيل كل سبت والمدربة ترد عليك." }
];

export const isIosBrowser = () => {
  if (typeof window === "undefined") return false;
  const n = navigator as Navigator & { standalone?: boolean };
  const ios = /iphone|ipad|ipod/i.test(n.userAgent) || (n.platform === "MacIntel" && n.maxTouchPoints > 1);
  return ios && !n.standalone && !window.matchMedia("(display-mode: standalone)").matches;
};

const seen = (k: string) => {
  try { return localStorage.getItem(k) === "1"; } catch { return true; }
};
const mark = (k: string) => {
  try { localStorage.setItem(k, "1"); } catch {}
};

/** First open: three short intro screens (skippable), then on iPhone Safari how to add the app to the home screen. */
export function FirstRun() {
  const [step, setStep] = useState<"intro" | "ios" | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!seen(SEEN)) setStep("intro");
    else if (isIosBrowser() && !seen(IOS_SEEN)) setStep("ios");
  }, []);
  if (!step) return null;

  const endIntro = () => {
    mark(SEEN);
    setStep(isIosBrowser() && !seen(IOS_SEEN) ? "ios" : null);
  };
  if (step === "ios") return <IosGuide onClose={() => { mark(IOS_SEEN); setStep(null); }} />;

  const s = SLIDES[i];
  return (
    <div className="first-run" role="dialog" aria-modal="true" aria-label="تعريف بالتطبيق">
      <button type="button" className="fr-skip" onClick={endIntro}>تخطي</button>
      <div className="fr-body">
        <span className="fr-em" aria-hidden="true">{s.em}</span>
        <h2>{s.t}</h2>
        <p>{s.d}</p>
      </div>
      <div className="fr-dots" aria-hidden="true">{SLIDES.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
      <button type="button" className="btn btn-p btn-block" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : endIntro())}>
        {i < SLIDES.length - 1 ? "التالي" : "يلا نبدأ"}
      </button>
    </div>
  );
}

/** «أضيفي التطبيق للشاشة الرئيسية» for iPhone Safari, with drawn steps. */
export function IosGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="first-run" role="dialog" aria-modal="true" aria-label="أضيفي التطبيق للشاشة الرئيسية">
      <button type="button" className="fr-skip" onClick={onClose}>لاحقا</button>
      <div className="fr-body" style={{ gap: 14 }}>
        <h2>ثبتي التطبيق على جوالك</h2>
        <p>عشان يفتح مثل أي تطبيق وتوصلك التذكيرات وملخص يومك.</p>
        <p className="small">على الآيفون الإشعارات ما توصل إلا بعد ما تثبتين التطبيق على الشاشة الرئيسية بهالطريقة:</p>
        <ol className="ios-steps">
          <li>
            <span className="ios-shot" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#050F2C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" /></svg>
            </span>
            <span>اضغطي زر <b>المشاركة</b> تحت في سفاري (المربع اللي طالع منه سهم).</span>
          </li>
          <li>
            <span className="ios-shot menu" aria-hidden="true">
              <span>إضافة إلى الشاشة الرئيسية</span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>
            </span>
            <span>انزلي واختاري <b>«إضافة إلى الشاشة الرئيسية»</b>.</span>
          </li>
          <li>
            <span className="ios-shot" aria-hidden="true"><b style={{ color: "#050F2C", fontSize: 17 }}>إضافة</b></span>
            <span>اضغطي <b>«إضافة»</b> فوق، وبيطلع لك شعار ZahraaFit مع تطبيقاتك.</span>
          </li>
        </ol>
      </div>
      <button type="button" className="btn btn-p btn-block" onClick={onClose}>تمام</button>
    </div>
  );
}
