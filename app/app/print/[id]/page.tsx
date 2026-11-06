"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Loading } from "@/components/ui";
import { unpackDoc } from "@/lib/doc-pack";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { STORE_URL, accountOf } from "@/lib/account";
import type { Plan } from "@/lib/types";

/** Her plan in the coach's own design, with a button to save it as PDF. */
export default function PrintPage() {
  const auth = useAuthGuard();
  const params = useParams<{ id: string }>();
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState("خطتي");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!auth.profile || !params?.id) return;
    (async () => {
      const { data } = await supabase.from("plans").select("title, data").eq("id", params.id).maybeSingle();
      const d = (data as Pick<Plan, "title" | "data"> | null)?.data as { format?: string; html?: string; gz?: string } | undefined;
      if (!data || d?.format !== "zahraafit-doc" || !(d.html || d.gz)) return setMissing(true);
      setTitle(String(data.title || "خطتي").replace(/\s*\(PDF\)$/, ""));
      try {
        setHtml(await unpackDoc(d));
      } catch {
        setMissing(true);
      }
    })();
  }, [auth.profile, params?.id]);

  function save() {
    try {
      frame.current?.contentWindow?.focus();
      frame.current?.contentWindow?.print();
    } catch {
      window.print();
    }
  }

  if (auth.loading) return <Loading />;
  const back = auth.profile?.role === "admin" ? "/coach" : "/app";
  if (auth.profile && !accountOf(auth.profile).sub) {
    return (
      <main className="screen gutter" style={{ paddingTop: 40 }}>
        <p className="alert info">تحميل الخطة PDF للمشتركين. جددي اشتراكك عشان تحملينها.</p>
        <a className="btn btn-p" href={STORE_URL} target="_blank" rel="noreferrer">جددي اشتراكك</a>
        <a className="link" href={back}>رجوع</a>
      </main>
    );
  }
  if (!html && !missing) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="s-top gutter">
        <Link className="icon-btn" href={back} aria-label="رجوع">
          <ChevronRight />
        </Link>
        <b style={{ flex: 1, minWidth: 0 }}>{title}</b>
        {html ? (
          <button type="button" className="btn btn-p btn-sm" onClick={save}>
            <Download />
            حفظ PDF
          </button>
        ) : null}
      </div>
      {html ? (
        <>
          <p className="note gutter" style={{ padding: "8px 16px" }}>
            اضغطي «حفظ PDF»، وفي نافذة الطباعة اختاري «حفظ كـ PDF» (في الآيفون: مشاركة ثم حفظ في الملفات).
          </p>
          <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin allow-modals" style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
        </>
      ) : (
        <p className="alert info gutter" style={{ margin: 16 }}>ما لقينا الملف. ارجعي للرئيسية وافتحيه من هناك.</p>
      )}
    </div>
  );
}
