"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Article } from "@/lib/types";
import { ClientShell, Loading } from "@/components/ui";
import { Calculator } from "@/components/Calculator";
import { NUTRITION_GUIDE, WORKOUT_GUIDE, type GuideSection } from "@/lib/guide-content";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";
import { accountOf } from "@/lib/account";
import type { MealPlanData } from "@/lib/plan-data";

function Section({ s, open }: { s: GuideSection; open?: boolean }) {
  return (
    <details className="gsec" open={open}>
      <summary>
        <span className="em" aria-hidden="true">{s.emoji}</span>
        <span>
          <b>{s.title}</b>
          <span className="sub">{s.sub}</span>
        </span>
      </summary>
      <div className="gbody">
        {s.items?.map((it) => (
          <div key={it.title} className="gitem">
            <b>{it.title}</b>
            {it.text}
            {it.warn ? <span className="warn">⚠️ {it.warn}</span> : null}
          </div>
        ))}
        {s.table ? (
          <div style={{ overflowX: "auto" }}>
            <table className="gtable">
              <thead>
                <tr>{s.table.head.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {s.table.rows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {s.table.note ? <p className="note" style={{ marginTop: 6 }}>{s.table.note}</p> : null}
          </div>
        ) : null}
        {s.after ? (
          <div className="tip-card">
            <span className="em" aria-hidden="true">💡</span>
            <span>{s.after}</span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export default function GuidePage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const [tab, setTab] = useState<"food" | "workout" | "articles" | "calc">("food");
  const [articles, setArticles] = useState<Article[] | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "articles" || t === "calc") setTab(t);
  }, []);
  useEffect(() => {
    if (tab !== "articles" || articles || !auth.profile) return;
    supabase.from("articles").select("*").eq("published", true).order("published_at", { ascending: false }).then(({ data }) => setArticles((data as Article[] | null) || []));
  }, [tab, articles, auth.profile]);
  if (auth.loading || cp.loading) return <Loading />;
  if (!auth.profile) return null;
  // Open calories: her target minus the average day of her plan (subscribers with a plan only).
  const plan = accountOf(auth.profile).sub ? ((cp.mealRow?.data as MealPlanData | undefined) || null) : null;
  const avgDay = plan?.days.length ? plan.days.reduce((a, d) => a + d.meals.reduce((b, m) => b + (m.cal || 0), 0), 0) / plan.days.length : 0;
  const open = plan?.target.cal && avgDay ? Math.round((plan.target.cal - avgDay) / 10) * 10 : 0;
  const withOpen = (secs: GuideSection[]) =>
    secs.map((s) => ({
      ...s,
      items: s.items
        ?.filter((it) => !it.open || open >= 30)
        .map((it) => (it.open ? { ...it, title: it.title.replace("{open}", String(open)), text: it.text.replace("{open}", String(open)) } : it))
    }));
  const list = tab === "food" ? withOpen(NUTRITION_GUIDE) : tab === "workout" ? WORKOUT_GUIDE : [];

  return (
    <ClientShell title="دليلك" sub="كل اللي تحتاجين تعرفينه، من المدربة زهراء">
      <div className="seg-tabs" role="tablist" aria-label="أقسام الدليل">
        <button type="button" role="tab" aria-selected={tab === "food"} onClick={() => setTab("food")}>🥗 التغذية</button>
        <button type="button" role="tab" aria-selected={tab === "workout"} onClick={() => setTab("workout")}>🏋️‍♀️ التمارين</button>
        <button type="button" role="tab" aria-selected={tab === "articles"} onClick={() => setTab("articles")}>📰 مقالات</button>
        <button type="button" role="tab" aria-selected={tab === "calc"} onClick={() => setTab("calc")}>🧮 حاسبة</button>
      </div>
      {tab === "articles" ? (
        articles === null ? (
          <p className="note">لحظة...</p>
        ) : articles.length ? (
          articles.map((a) => (
            <Link key={a.id} href={`/app/articles/${a.id}`} className="card row" style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">{a.emoji || "📰"}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: "block", color: "var(--navy)" }}>{a.title}</b>
                <span className="note">{a.published_at ? formatDate(a.published_at) : ""}</span>
              </span>
            </Link>
          ))
        ) : (
          <p className="alert info">ما فيه مقالات للحين. المدربة بتنزل مقال كل أسبوع.</p>
        )
      ) : null}
      {tab === "calc" ? <Calculator profileId={auth.profile.id} /> : null}
      {list.map((s, i) => (
        <Section key={`${tab}-${s.title}`} s={s} open={i === 0} />
      ))}
    </ClientShell>
  );
}
