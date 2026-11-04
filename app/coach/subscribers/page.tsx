"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import { CoachShell, Empty, Loading } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { planTypeLabel } from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, PlanRequest, Profile } from "@/lib/types";

const STATUS: Record<string, [string, string]> = {
  submitted: ["تنتظر خطتها", "amber"],
  in_progress: ["شغالة عليها", "blue"],
  delivered: ["أرسلتي خطتها", "green"]
};

type Row = { client: Client; profile: Profile | null; latest: PlanRequest | null };

export default function SubscribersPage() {
  const auth = useAuthGuard("admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!auth.profile) return;
      const [{ data: clients }, { data: profiles }, { data: requests }] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("role", "client"),
        supabase.from("plan_requests").select("*").neq("status", "cancelled").order("submitted_at", { ascending: false })
      ]);
      const byProfile = new Map(((profiles as Profile[] | null) || []).map((p) => [p.id, p]));
      const latest = new Map<string, PlanRequest>();
      ((requests as PlanRequest[] | null) || []).forEach((r) => {
        if (!latest.has(r.client_id)) latest.set(r.client_id, r);
      });
      setRows(((clients as Client[] | null) || []).map((c) => ({ client: c, profile: byProfile.get(c.profile_id) || null, latest: latest.get(c.id) || null })));
      setLoading(false);
    }
    load();
  }, [auth.profile]);

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => [r.profile?.full_name, r.profile?.phone, r.profile?.email].some((v) => v?.includes(q)));
  }, [rows, query]);

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>المشتركات</h1>
      <div className="unit">
        <label htmlFor="q" className="sr-only">ابحثي</label>
        <input id="q" className="inp" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحثي بالاسم أو الجوال أو الإيميل" />
        <span><Search size={16} /></span>
      </div>

      {shown.length ? (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 10 }}>
          {shown.map(({ client, profile, latest }) => {
            const st = latest ? STATUS[latest.status] : null;
            const inner = (
              <>
                <span className="avatar">{(profile?.full_name || "؟").slice(0, 1)}</span>
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="row wrap" style={{ gap: 8 }}>
                    <b>{profile?.full_name || "بدون اسم"}</b>
                    {st ? <span className={`chip ${st[1]}`}>{st[0]}</span> : <span className="chip">ما عبت معلوماتها</span>}
                  </span>
                  <span className="small muted">
                    {[latest ? planTypeLabel(latest) : null, profile?.phone, `سجلت ${formatDate(client.created_at)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </>
            );
            return (
              <li key={client.id}>
                {latest ? (
                  <Link className="list-row" href={`/coach/requests/${latest.id}`}>{inner}</Link>
                ) : (
                  <div className="list-row">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={<UsersRound />} title={query ? "ما لقينا أحد بهالبحث" : "ما فيه مشتركات للحين"} />
      )}
    </CoachShell>
  );
}
