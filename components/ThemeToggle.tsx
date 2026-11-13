"use client";

import { useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";

/** «الوضع»: follow the phone, or always light / dark (kept on this phone). */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");
  useEffect(() => {
    try {
      const t = localStorage.getItem("zf-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  const pick = (m: Mode) => {
    setMode(m);
    try {
      if (m === "auto") localStorage.removeItem("zf-theme");
      else localStorage.setItem("zf-theme", m);
    } catch {}
    if (m === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", m);
  };
  return (
    <section className="card stack">
      <b>الوضع</b>
      <div className="seg-tabs" role="tablist" aria-label="الوضع">
        {([["auto", "تلقائي"], ["light", "فاتح"], ["dark", "داكن"]] as [Mode, string][]).map(([m, l]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => pick(m)}>{l}</button>
        ))}
      </div>
      <p className="note">التلقائي يمشي مع وضع جوالك.</p>
    </section>
  );
}
