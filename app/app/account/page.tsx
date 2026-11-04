"use client";

import { LogOut } from "lucide-react";
import { ClientShell, Loading } from "@/components/ui";
import { signOut, useAuthGuard } from "@/lib/use-auth";

export default function AccountPage() {
  const auth = useAuthGuard("client");
  if (auth.loading) return <Loading />;
  if (!auth.profile) return null;
  const p = auth.profile;

  return (
    <ClientShell title="حسابي">
      <section className="card stack">
        <div className="row">
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>{(p.full_name || "؟").slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 17 }}>{p.full_name}</b>
            <div className="small muted" dir="ltr" style={{ textAlign: "right" }}>{p.email}</div>
          </div>
        </div>
        <dl className="kv">
          <div>
            <dt>الجوال</dt>
            <dd dir="ltr" style={{ textAlign: "right" }}>{p.phone || "—"}</dd>
          </div>
        </dl>
      </section>
      <button type="button" className="btn btn-g btn-block" onClick={signOut}>
        <LogOut />
        تسجيل الخروج
      </button>
    </ClientShell>
  );
}
