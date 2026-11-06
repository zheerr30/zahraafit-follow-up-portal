import Link from "next/link";

/** Shared layout for the privacy policy and the terms (public pages). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="legal gutter" dir="rtl">
      <div className="safe-top" aria-hidden="true" />
      <header className="legal-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="ZahraaFit" style={{ height: 40 }} />
        <h1>{title}</h1>
        <p className="small muted">آخر تحديث: {updated}</p>
      </header>
      <article className="legal-body">{children}</article>
      <p className="small" style={{ marginTop: 24 }}><Link href="/app/account">← رجوع للتطبيق</Link></p>
    </main>
  );
}
