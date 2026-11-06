"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { flushQueue, pendingCount } from "@/lib/offline";
import { supabase } from "@/lib/supabase";

/** Page name for the usage stats, without ids (/app/print/123 → /app/print/[id]). */
const pageName = (p: string) => p.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, "/[id]").toLowerCase().slice(0, 60);

/** Count a button tap in the usage stats (no personal data). */
export function track(name: string) {
  supabase.rpc("log_event", { p_kind: "tap", p_name: name.slice(0, 60) }).then(() => {}, () => {});
}

/** Top banner when there's no internet, sends saved changes when it's back, and counts page views. */
export function AppStatus() {
  const path = usePathname();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const upd = () => {
      setOnline(navigator.onLine);
      setPending(pendingCount());
    };
    const back = () => {
      upd();
      flushQueue().then(upd);
    };
    upd();
    flushQueue().then(upd);
    window.addEventListener("online", back);
    window.addEventListener("offline", upd);
    window.addEventListener("zf-queue", upd);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", upd);
      window.removeEventListener("zf-queue", upd);
    };
  }, []);

  useEffect(() => {
    if (!path || !navigator.onLine) return;
    supabase.rpc("log_event", { p_kind: "view", p_name: pageName(path) }).then(() => {}, () => {});
  }, [path]);

  if (online && !pending) return null;
  return (
    <div className={`net-bar ${online ? "sync" : ""}`} role="status">
      {online ? "⏳ نرفع اللي سجلتيه وانتي بدون نت..." : `📡 ما فيه اتصال بالنت. الماء والوجبات والوزن تنحفظ في جوالك وتترفع لما يرجع النت${pending ? ` (${pending})` : ""}.`}
    </div>
  );
}
