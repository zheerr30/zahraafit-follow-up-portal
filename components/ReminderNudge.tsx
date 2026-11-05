"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { pushState } from "@/lib/push";

/** Small home card inviting her to turn reminders on. Hidden once on, or dismissed. */
export function ReminderNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("zf-nudge-off")) return;
    } catch {}
    pushState().then((s) => setShow(s === "off" || s === "install"));
  }, []);
  if (!show) return null;
  return (
    <div className="tip-card" style={{ alignItems: "center" }}>
      <span className="em" aria-hidden="true">🔔</span>
      <Link href="/app/account#reminders" style={{ flex: 1 }}>
        <b>شغلي التذكيرات</b> ونذكرك بوجباتك والماء والتمرين
      </Link>
      <button type="button" className="icon-btn" aria-label="إخفاء" onClick={() => {
        setShow(false);
        try { localStorage.setItem("zf-nudge-off", "1"); } catch {}
      }}><X size={16} /></button>
    </div>
  );
}
