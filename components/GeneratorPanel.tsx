"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { FILL_SCRIPT, FILL_WORKOUT_SCRIPT, READ_DOC_SCRIPT, READ_PLANS_SCRIPT, READ_WORKOUT_SCRIPT, mealGeneratorFields, workoutGeneratorState } from "@/lib/generator";
import { packDoc } from "@/lib/doc-pack";
import { parsePlanFile, type MealPlanData, type ParsedPlan } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

type GenWindow = Window & { eval: (code: string) => unknown };

/** Full-screen meal or workout generator, filled with the subscriber's answers. */
export function GeneratorPanel({ kind = "meal", answers, name, clientId, onClose, onUse }: { kind?: "meal" | "workout"; answers: unknown; name: string; clientId?: string; onClose: () => void; onUse: (p: ParsedPlan) => void }) {
  const rated = useRef<{ liked: string[]; disliked: string[] } | undefined>(undefined);
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef("");
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<MealPlanData[] | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      token.current = s.session?.access_token || "";
      const res = await fetch(`/api/generators/${kind}`, { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` }, cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 401 || res.status === 403 ? "المولد يفتح لحساب المدربة بس. سجلي خروج وادخلي مرة ثانية." : "ما قدرنا نفتح المولد. حدثي الصفحة وجربي مرة ثانية.");
        return;
      }
      if (clientId && kind === "meal") {
        // Her 👍/👎 on the current plan's meals, so the next plan avoids what she disliked.
        const { data: pl } = await supabase.from("plans").select("id").eq("client_id", clientId).eq("kind", "nutrition").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (pl) {
          const { data: ch } = await supabase.from("plan_choices").select("data").eq("plan_id", pl.id).maybeSingle();
          const r = ((ch?.data as { rates?: Record<string, number> } | null)?.rates) || {};
          rated.current = { liked: Object.keys(r).filter((k) => r[k] === 1), disliked: Object.keys(r).filter((k) => r[k] === -1) };
        }
      }
      setHtml(await res.text());
    })();
  }, [clientId, kind]);

  function win(): GenWindow | null {
    return (frame.current?.contentWindow as GenWindow | null) || null;
  }

  function fill() {
    const w = win();
    if (!w) return;
    try {
      w.eval(kind === "workout" ? FILL_WORKOUT_SCRIPT(workoutGeneratorState(answers), token.current) : FILL_SCRIPT(mealGeneratorFields(answers, rated.current)));
    } catch {
      // The generator still opens; she can fill it by hand.
    }
  }

  function read() {
    const w = win();
    if (!w) return;
    setReading(true);
    if (kind === "workout") {
      try {
        const out = String(w.eval(READ_WORKOUT_SCRIPT) || "");
        if (!out) setError("ما فيه جدول للحين. ولدي الجدول في المولد، بعدها اضغطي «أرسلي هذا الجدول».");
        else {
          onUse(parsePlanFile(out));
          onClose();
        }
      } catch {
        setError("ما قدرنا نقرأ الجدول من المولد. إذا عدلتي على طريقة حفظ الجدول فيه، أرسليه لي أشوفه.");
      }
      setReading(false);
      return;
    }
    try {
      const list = JSON.parse(String(w.eval(READ_PLANS_SCRIPT))) as MealPlanData[];
      const usable = list.filter((p) => p.days?.length);
      if (!usable.length) setError("ما فيه جدول للحين. ولدي الجدول في المولد، بعدها اضغطي «أرسلي هذا الجدول».");
      else {
        setError(null);
        setPlans(usable);
      }
    } catch {
      setError("ما قدرنا نقرأ الجدول من المولد. إذا عدلتي على طريقة حفظ الجداول فيه، أرسليه لي أشوفه.");
    }
    setReading(false);
  }

  async function use(p: MealPlanData, newest: boolean) {
    try {
      const parsed = parsePlanFile(JSON.stringify(p));
      // The generator's designed document matches the plan it shows last.
      if (newest) {
        try {
          const doc = String(win()?.eval(READ_DOC_SCRIPT) || "");
          if (doc.length > 500) parsed.doc = await packDoc(doc, html || "");
        } catch {}
      }
      onUse(parsed);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const first = name.trim().split(" ")[0];
  const sorted = plans ? [...plans].sort((a, b) => Number(Boolean(b.name && first && b.name.includes(first))) - Number(Boolean(a.name && first && a.name.includes(first)))) : null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={kind === "workout" ? "مولد التمارين" : "مولد الأكل"} style={{ display: "flex", flexDirection: "column" }}>
      <div className="s-top gutter" style={{ flexWrap: "wrap" }}>
        <button type="button" className="icon-btn" aria-label="إغلاق المولد" onClick={onClose}>
          <X />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block" }}>{kind === "workout" ? "مولد التمارين" : "مولد الأكل"} · {name || "مشتركة"}</b>
          <span className="small muted">معلوماتها معباة. ولدي الجدول وعدلي عليه زي العادة.</span>
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
                <button key={`${p.date}-${i}`} type="button" className="opt" onClick={() => use(p, p === plans?.[0])}>
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
          <iframe ref={frame} title={kind === "workout" ? "مولد التمارين" : "مولد الأكل"} srcDoc={html} onLoad={() => setTimeout(fill, 400)} style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
        ) : !error ? (
          <div className="loading">
            <span className="row small">
              <Loader2 className="spin" size={18} />
              نفتح المولد...
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
