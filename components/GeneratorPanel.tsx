"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { FILL_SCRIPT, READ_PLANS_SCRIPT, mealGeneratorFields } from "@/lib/generator";
import { parsePlanFile, type MealPlanData, type ParsedPlan } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

type GenWindow = Window & { eval: (code: string) => unknown };

/** Full-screen meal generator, filled with the subscriber's answers. */
export function GeneratorPanel({ answers, name, onClose, onUse }: { answers: unknown; name: string; onClose: () => void; onUse: (p: ParsedPlan) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<MealPlanData[] | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/generators/meal", { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` }, cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 401 || res.status === 403 ? "المولّد يفتح لحساب المدربة بس. سجلي خروج وادخلي مرة ثانية." : "ما قدرنا نفتح المولّد. حدّثي الصفحة وجربي مرة ثانية.");
        return;
      }
      setHtml(await res.text());
    })();
  }, []);

  function win(): GenWindow | null {
    return (frame.current?.contentWindow as GenWindow | null) || null;
  }

  function fill() {
    const w = win();
    if (!w) return;
    try {
      w.eval(FILL_SCRIPT(mealGeneratorFields(answers)));
    } catch {
      // The generator still opens; she can fill it by hand.
    }
  }

  function read() {
    const w = win();
    if (!w) return;
    setReading(true);
    try {
      const list = JSON.parse(String(w.eval(READ_PLANS_SCRIPT))) as MealPlanData[];
      const usable = list.filter((p) => p.days?.length);
      if (!usable.length) setError("ما فيه جدول للحين. ولّدي الجدول في المولّد، بعدها اضغطي «أرسلي هذا الجدول».");
      else {
        setError(null);
        setPlans(usable);
      }
    } catch {
      setError("ما قدرنا نقرأ الجدول من المولّد. إذا عدلتي على طريقة حفظ الجداول فيه، أرسليه لي أشوفه.");
    }
    setReading(false);
  }

  function use(p: MealPlanData) {
    try {
      onUse(parsePlanFile(JSON.stringify(p)));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const first = name.trim().split(" ")[0];
  const sorted = plans ? [...plans].sort((a, b) => Number(Boolean(b.name && first && b.name.includes(first))) - Number(Boolean(a.name && first && a.name.includes(first)))) : null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="مولّد الأكل" style={{ display: "flex", flexDirection: "column" }}>
      <div className="s-top gutter" style={{ flexWrap: "wrap" }}>
        <button type="button" className="icon-btn" aria-label="إغلاق المولّد" onClick={onClose}>
          <X />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block" }}>مولّد الأكل · {name || "مشتركة"}</b>
          <span className="small muted">معلوماتها معبّاة. ولّدي الجدول وعدلي عليه زي العادة.</span>
        </div>
        <button type="button" className="btn btn-p btn-sm" disabled={!html || reading} onClick={read}>
          {reading ? <Loader2 className="spin" /> : <Send />}
          أرسلي هذا الجدول
        </button>
      </div>

      {error ? (
        <div className="gutter" style={{ paddingTop: 10 }}>
          <p className="alert err" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {sorted ? (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setPlans(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="اختاري الجدول">
            <div className="row between">
              <h2 style={{ fontSize: 18 }}>أي جدول ترسلينه لها؟</h2>
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setPlans(null)}>
                <X />
              </button>
            </div>
            <div className="opts">
              {sorted.map((p, i) => (
                <button key={`${p.date}-${i}`} type="button" className="opt" onClick={() => use(p)}>
                  <Check size={18} color="var(--clay)" />
                  <span>
                    <span className="opt-t">{p.name || "بدون اسم"}</span>
                    <span className="opt-s">
                      {p.target.cal} سعرة · {p.days.length} أيام{p.date ? ` · ${p.date}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="note">الجدول يروح للخطوة ٢، وتراجعينه وترسلينه من هناك.</p>
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0 }}>
        {html ? (
          <iframe ref={frame} title="مولّد الأكل" srcDoc={html} onLoad={() => setTimeout(fill, 400)} style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
        ) : !error ? (
          <div className="loading">
            <span className="row small">
              <Loader2 className="spin" size={18} />
              نفتح المولّد...
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
