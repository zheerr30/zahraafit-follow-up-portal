"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClipboardList, Dumbbell, Home, Inbox, LineChart, Loader2, LogOut, UserRound, Utensils, Wrench } from "lucide-react";
import { signOut } from "@/lib/use-auth";

export function Brand() {
  return (
    <span className="brand">
      Zahraa<b>Fit</b>
    </span>
  );
}

/** White logo for navy bars. */
export function LogoWhite({ height = 30 }: { height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo-w" src="/brand/logo-white.png" alt="ZahraaFit" style={{ height }} />;
}

export function Loading({ label = "لحظة..." }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="row small">
        <Loader2 className="spin" size={18} />
        {label}
      </span>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      {icon}
      <b style={{ fontSize: 17 }}>{title}</b>
      {children ? <div className="small muted">{children}</div> : null}
    </div>
  );
}

export function Rings() {
  return (
    <svg className="hero-rings" viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="1" aria-hidden="true">
      {[10, 22, 34, 46].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} />
      ))}
    </svg>
  );
}

/** Short message that disappears by itself. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return { show, node };
}

/** Subscriber screens: sticky top bar and bottom tabs. */
export function ClientShell({ title, sub, action, children }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const tabs = [
    { href: "/app", label: "الرئيسية", icon: <Home /> },
    { href: "/app/food", label: "أكلي", icon: <Utensils /> },
    { href: "/app/workout", label: "تماريني", icon: <Dumbbell /> },
    { href: "/app/progress", label: "تقدّمي", icon: <LineChart /> },
    { href: "/app/account", label: "حسابي", icon: <UserRound /> }
  ];
  return (
    <div className="app">
      <header className="appbar gutter">
        <div style={{ minWidth: 0 }}>
          <div className="t">{title}</div>
          {sub ? <div className="s">{sub}</div> : null}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {action}
          <LogoWhite height={34} />
        </div>
      </header>
      <main className="screen gutter">{children}</main>
      <nav className="nav" aria-label="الأقسام">
        <div className="nav-in">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>
              {t.icon}
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Coach screens: wider column, section links in the top bar. */
export function CoachShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const links = [
    { href: "/coach", label: "خطط تنتظرك", icon: <Inbox size={17} />, match: (p: string) => p === "/coach" || p.startsWith("/coach/requests") },
    { href: "/coach/subscribers", label: "المشتركات", icon: <ClipboardList size={17} />, match: (p: string) => p.startsWith("/coach/subscribers") },
    { href: "/coach/tools", label: "المولّدات", icon: <Wrench size={17} />, match: (p: string) => p.startsWith("/coach/tools") }
  ];
  return (
    <div className="app wide">
      <header className="appbar gutter wrap" style={{ borderRadius: "0 0 18px 18px" }}>
        <div className="row wrap" style={{ gap: 16 }}>
          <LogoWhite height={34} />
          <nav className="tabs-top" aria-label="أقسام اللوحة">
            {links.map((l) => (
              <Link key={l.href} className="tab-link" href={l.href} aria-current={l.match(path) ? "page" : undefined}>
                {l.icon}
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <button type="button" className="icon-btn" onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج">
          <LogOut />
        </button>
      </header>
      <main className="screen gutter" style={{ paddingBottom: 60 }}>
        {children}
      </main>
    </div>
  );
}
