"use client";

import { useEffect, useState } from "react";
import { FileText, FileUp, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { formatDate, safeFileName } from "@/lib/format";
import { parsePlanFile, type ParsedPlan } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Plan, PlanRequest } from "@/lib/types";

const KINDS = ["الجدول الغذائي", "الجدول الرياضي", "ملف إضافي"];
const KIND_OF: Record<string, "nutrition" | "workout" | "other"> = { "الجدول الغذائي": "nutrition", "الجدول الرياضي": "workout", "ملف إضافي": "other" };
const MAX_MB = 20;

type Pending = { name: string; title: string; file?: File; parsed?: ParsedPlan };

/**
 * Steps 2 and 3 on a request: attach the plan (PDF files and/or the data files
 * from the export buttons), then send. Nothing is saved until "send".
 */
export function PlanDelivery({ req, onDelivered, toast, incoming }: { req: PlanRequest; onDelivered: (r: PlanRequest) => void; toast: (m: string) => void; incoming?: ParsedPlan | null }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<(Plan & { url?: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!incoming) return;
    setPending((prev) => [...prev.filter((p) => !(p.parsed && p.parsed.kind === incoming.kind)), { name: "من المولد", title: incoming.title, parsed: incoming }]);
  }, [incoming]);

  useEffect(() => {
    if (req.status !== "delivered") return;
    (async () => {
      const { data } = await supabase.from("plans").select("*").eq("client_id", req.client_id).gte("created_at", req.submitted_at).order("created_at", { ascending: true });
      const list = (data as Plan[] | null) || [];
      setSent(
        await Promise.all(
          list.map(async (p) => {
            if (!p.file_path) return p;
            const { data: s } = await supabase.storage.from("client-plans").createSignedUrl(p.file_path, 60 * 60);
            return { ...p, url: s?.signedUrl };
          })
        )
      );
    })();
  }, [req.status, req.id, req.client_id, req.submitted_at]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...pending];
    const pdfTitle = () => {
      const used = new Set(next.filter((p) => p.file).map((p) => p.title));
      if (req.wants_nutrition && !used.has(KINDS[0])) return KINDS[0];
      if (req.wants_workout && !used.has(KINDS[1])) return KINDS[1];
      return KINDS[2];
    };
    for (const f of Array.from(files)) {
      if (f.name.toLowerCase().endsWith(".json") || f.type === "application/json") {
        try {
          const parsed = parsePlanFile(await f.text());
          const rest = next.filter((p) => !(p.parsed && p.parsed.kind === parsed.kind));
          next.length = 0;
          next.push(...rest, { name: f.name, title: parsed.title, parsed });
        } catch (e) {
          setError((e as Error).message);
        }
        continue;
      }
      if (!/pdf|image\//.test(f.type)) {
        setError("ارفعي الخطة PDF، أو ملف البيانات اللي ينزل من زر التصدير.");
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`الملف ${f.name} أكبر من ${MAX_MB} ميقا.`);
        continue;
      }
      next.push({ name: f.name, title: pdfTitle(), file: f });
    }
    setPending(next);
  }

  async function send() {
    if (!pending.length) return setError("ارفعي ملف الخطة أول.");
    setBusy(true);
    setError(null);

    const rows: Record<string, unknown>[] = [];
    for (const p of pending) {
      if (p.parsed) {
        rows.push({ client_id: req.client_id, title: p.parsed.title, kind: p.parsed.kind, data: p.parsed.data, content: message.trim() || null, is_current: true });
        if (p.parsed.doc) {
          rows.push({ client_id: req.client_id, title: `${p.parsed.title} (PDF)`, kind: "other", data: p.parsed.doc, content: message.trim() || null, is_current: true });
        }
        continue;
      }
      const path = `${req.client_id}/${safeFileName(p.file!.name)}`;
      const { error: upErr } = await supabase.storage.from("client-plans").upload(path, p.file!, { upsert: false, contentType: p.file!.type });
      if (upErr) {
        setBusy(false);
        return setError(`ما قدرنا نرفع ${p.name}. جربي مرة ثانية.`);
      }
      rows.push({ client_id: req.client_id, title: p.title, kind: KIND_OF[p.title] || "other", content: message.trim() || null, file_path: path, is_current: true });
    }

    // Older plans stay in her history but stop being "current".
    await supabase.from("plans").update({ is_current: false }).eq("client_id", req.client_id).eq("is_current", true);
    const { error: insErr } = await supabase.from("plans").insert(rows);
    if (insErr) {
      setBusy(false);
      return setError(
        /column|kind|data/.test(insErr.message)
          ? "قاعدة البيانات تحتاج تحديث: شغلي ملف phase2-interactive-plans.sql في Supabase، وبعدها أرسلي مرة ثانية."
          : "ما قدرنا نحفظ الخطة. جربي مرة ثانية."
      );
    }

    const { data, error: updErr } = await supabase
      .from("plan_requests")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), started_at: req.started_at || new Date().toISOString() })
      .eq("id", req.id)
      .select("*")
      .single();
    setBusy(false);
    if (updErr || !data) return setError("انحفظت الخطة بس ما قدرنا نقفل الطلب. جربي مرة ثانية.");
    setPending([]);
    setMessage("");
    onDelivered(data as PlanRequest);
    toast("وصلت الخطة لحسابها");
  }

  if (req.status === "delivered") {
    return (
      <section className="card stack">
        <h2 style={{ fontSize: 17 }}>الخطة اللي أرسلتيها</h2>
        <p className="alert ok">أرسلتيها {req.delivered_at ? formatDate(req.delivered_at) : ""}. تشوفها في حسابها.</p>
        {sent.map((p) => (
          <div key={p.id} className="row between wrap">
            <span className="row small">
              {p.data ? <Sparkles size={18} color="var(--clay)" /> : <FileText size={18} color="var(--clay)" />}
              {p.title}
              {p.data ? <span className="chip clay">تفاعلي</span> : null}
            </span>
            {p.url ? (
              <a className="btn btn-g btn-sm" href={p.url} target="_blank" rel="noreferrer">
                افتحي
              </a>
            ) : null}
          </div>
        ))}
      </section>
    );
  }

  const hasData = pending.some((p) => p.parsed);

  return (
    <section className="card stack">
      <div className="stack" style={{ gap: 4 }}>
        <span className="label">الخطوة ٢</span>
        <h2 style={{ fontSize: 17 }}>ارفعي الخطة</h2>
        <p className="note">
          الجدول اللي ترسلينه من المولد يطلع هنا. وتقدرين تضيفين PDF لو تبين.
        </p>
      </div>

      {pending.map((p, i) => (
        <div key={i} className="row" style={{ gap: 8, padding: 12, borderRadius: 14, background: p.parsed ? "var(--clay-tint)" : "var(--sunken)" }}>
          {p.parsed ? <Sparkles size={20} color="var(--clay)" style={{ flexShrink: 0 }} /> : <FileText size={20} color="var(--clay)" style={{ flexShrink: 0 }} />}
          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {p.parsed ? (
              <>
                <b className="small">{p.parsed.title} · تفاعلي{p.parsed.doc ? " + PDF" : ""}</b>
                <span className="note">
                  {p.parsed.kind === "nutrition"
                    ? `${p.parsed.data.days.length} أيام · ${p.parsed.data.target.cal} سعرة`
                    : `${p.parsed.data.days.length} أيام · ${p.parsed.data.days.reduce((a, d) => a + d.exercises.length, 0)} تمرين`}
                  {p.parsed.data.name ? ` · ${p.parsed.data.name}` : ""}
                </span>
              </>
            ) : (
              <>
                <label className="sr-only" htmlFor={`kind-${i}`}>نوع الملف</label>
                <select id={`kind-${i}`} className="inp" style={{ minHeight: 40, fontSize: 14 }} value={p.title} onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </>
            )}
            <span className="note" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </div>
          <button type="button" className="icon-btn" aria-label={`شيلي ${p.name}`} onClick={() => setPending(pending.filter((_, j) => j !== i))}>
            <Trash2 size={18} />
          </button>
        </div>
      ))}

      <label className="file-drop">
        <FileUp />
        <span>{pending.length ? "أضيفي ملف ثاني (PDF)" : "أو ارفعي PDF"}</span>
        <input type="file" className="sr-only" accept="application/pdf,image/*,application/json,.json" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {pending.length && !hasData ? <p className="note">بالـPDF بس، المشتركة تقرأ خطتها، بس ما تقدر تعلم على وجباتها أو تبدل الأصناف. ولدي الجدول من الخطوة ١ عشان تصير تفاعلية.</p> : null}

      <div className="stack" style={{ gap: 4, marginTop: 6 }}>
        <span className="label">الخطوة ٣</span>
        <h2 style={{ fontSize: 17 }}>أرسليها لها</h2>
      </div>
      <div className="field">
        <label htmlFor="plan-msg">رسالة تطلع لها مع الخطة (اختياري)</label>
        <textarea id="plan-msg" className="inp" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="مثلًا: أهم شي هالشهر الالتزام والبروتين. أي سؤال كلميني على الواتس." />
      </div>
      {error ? <p className="alert err" role="alert">{error}</p> : null}
      <button type="button" className="btn btn-p btn-block" disabled={busy || !pending.length} onClick={send}>
        {busy ? <Loader2 className="spin" /> : <Send />}
        أرسلي الخطة
      </button>
      <p className="note">أول ما ترسلين، تطلع الخطة في حسابها، والطلب يطلع من «خطط تنتظرك».</p>
    </section>
  );
}
