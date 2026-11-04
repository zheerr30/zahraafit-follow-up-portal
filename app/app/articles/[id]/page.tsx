"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ClientShell, Loading } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Article } from "@/lib/types";

export default function ArticlePage() {
  const auth = useAuthGuard();
  const params = useParams<{ id: string }>();
  const [a, setA] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    if (!auth.profile || !params?.id) return;
    supabase.from("articles").select("*").eq("id", params.id).maybeSingle().then(({ data }) => setA((data as Article | null) || null));
  }, [auth.profile, params?.id]);

  if (auth.loading || a === undefined) return <Loading />;
  if (!auth.profile) return null;

  return (
    <ClientShell title="مقال" action={<Link className="icon-btn" href="/app/guide?tab=articles" aria-label="كل المقالات"><ChevronRight /></Link>}>
      {a ? (
        <article className="card stack" style={{ gap: 14 }}>
          <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">{a.emoji || "📰"}</span>
          <h1 style={{ fontSize: 24, lineHeight: 1.4, color: "var(--navy)" }}>{a.title}</h1>
          <span className="small muted">المدربة زهراء{a.published_at ? ` · ${formatDate(a.published_at)}` : ""}</span>
          {a.body.split(/\n\s*\n/).map((para, i) => (
            <p key={i} style={{ fontSize: 16, lineHeight: 2, whiteSpace: "pre-line" }}>{para}</p>
          ))}
        </article>
      ) : (
        <p className="alert info">المقال هذا مو موجود.</p>
      )}
    </ClientShell>
  );
}
