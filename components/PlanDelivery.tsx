"use client";

import { useEffect, useState } from "react";
import { FileText, FileUp, Loader2, Send, Trash2 } from "lucide-react";
import { formatDate, safeFileName } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Plan, PlanRequest } from "@/lib/types";

const KINDS = ["الجدول الغذائي", "الجدول الرياضي", "ملف إضافي"];
const MAX_MB = 20;

type Pending = { file: File; title: string };

/**
 * Step 2 and 3 on a request: attach the plan files, then send them.
 * Files stay in this browser until "send"; sending uploads them, makes them
 * her current plan (older plans stay in her history) and closes the request.
 */
export function PlanDelivery({
  req,
  onDelivered,
  toast
}: {
  req: PlanRequest;
  onDelivered: (r: PlanRequest) => void;
  toast: (m: string) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<(Plan & { url?: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSent() {
    const { data } = await supabase
      .from("plans")
      .select("*")
      .eq("client_id", req.client_id)
      .gte("created_at", req.submitted_at)
      .order("created_at", { ascending: true });
    const list = (data as Plan[] | null) || [];
    const withUrls = await Promise.all(
      list.map(async (p) => {
        if (!p.file_path) return p;
        const { data: s } = await supabase.storage.from("client-plans").createSignedUrl(p.file_path, 60 * 60);
        return { ...p, url: s?.signedUrl };
      })
    );
    setSent(withUrls);
  }

  useEffect(() => {
    if (req.status === "delivered") loadSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.status, req.id]);

  function defaultTitle() {
    const used = new Set(pending.map((p) => p.title));
    if (req.wants_nutrition && !used.has(KINDS[0])) return KINDS[0];
    if (req.wants_workout && !used.has(KINDS[1])) return KINDS[1];
    return KINDS[2];
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...pending];
    for (const f of Array.from(files)) {
      if (!/pdf|image\//.test(f.type)) {
        setError("ارفعي الخطة كملف PDF. احفظيها من المولّد بزر «حفظ PDF».");
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`الملف ${f.name} أكبر من ${MAX_MB} ميقا.`);
        continue;
      }
      const used = new Set(next.map((p) => p.title));
      const title = req.wants_nutrition && !used.has(KINDS[0]) ? KINDS[0] : req.wants_workout && !used.has(KINDS[1]) ? KINDS[1] : defaultTitle();
      next.push({ file: f, title });
    }
    setPending(next);
  }

  async function send() {
    if (!pending.length) return setError("ارفعي ملف الخطة أول.");
    setBusy(true);
    setError(null);

    const rows: Partial<Plan>[] = [];
    for (const p of pending) {
      const path = `${req.client_id}/${safeFileName(p.file.name)}`;
      const { error: upErr } = await supabase.storage.from("client-plans").upload(path, p.file, { upsert: false, contentType: p.file.type });
      if (upErr) {
        setBusy(false);
        return setError(`ما قدرنا نرفع ${p.file.name}. جربي مرة ثانية.`);
      }
      rows.push({ client_id: req.client_id, title: p.title, content: message.trim() || null, file_path: path, is_current: true });
    }

    // Older plans stay in her history but stop being "current".
    await supabase.from("plans").update({ is_current: false }).eq("client_id", req.client_id).eq("is_current", true);
    const { error: insErr } = await supabase.from("plans").insert(rows);
    if (insErr) {
      setBusy(false);
      return setError("رفعنا الملفات بس ما قدرنا نحفظ الخطة. جربي مرة ثانية.");
    }

    const { data, error: updErr } = await supabase
      .from("plan_requests")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), started_at: req.started_at || new Date().toISOString() })
      .eq("id", req.id)
      .select("*")
      .single();
    setBusy(false);
    if (updErr || !data) return setError("انحفظت الخطة بس ما قدرنا نقفل الطلب. اضغطي «أرسلي» مرة ثانية.");
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
              <FileText size={18} color="var(--clay)" />
              {p.title}
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

  return (
    <section className="card stack">
      <div className="stack" style={{ gap: 4 }}>
        <span className="label">الخطوة ٢</span>
        <h2 style={{ fontSize: 17 }}>ارفعي ملف الخطة</h2>
        <p className="note">بعد ما يطلع الجدول من المولّد، احفظيه PDF وارفعيه هنا. تقدرين ترفعين أكثر من ملف، مثلًا الغذائي والرياضي.</p>
      </div>

      {pending.map((p, i) => (
        <div key={i} className="row" style={{ gap: 8, padding: 12, borderRadius: 14, background: "var(--sunken)" }}>
          <FileText size={20} color="var(--clay)" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="sr-only" htmlFor={`kind-${i}`}>نوع الملف</label>
            <select
              id={`kind-${i}`}
              className="inp"
              style={{ minHeight: 40, fontSize: 14 }}
              value={p.title}
              onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <span className="note" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.file.name}</span>
          </div>
          <button type="button" className="icon-btn" aria-label={`شيلي ${p.file.name}`} onClick={() => setPending(pending.filter((_, j) => j !== i))}>
            <Trash2 size={18} />
          </button>
        </div>
      ))}

      <label className="file-drop">
        <FileUp />
        <span>{pending.length ? "أضيفي ملف ثاني" : "اختاري ملف الخطة (PDF)"}</span>
        <input type="file" className="sr-only" accept="application/pdf,image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>

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
