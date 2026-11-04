"use client";

import { useState } from "react";
import { ClientShell, Loading } from "@/components/ui";
import { NUTRITION_GUIDE, WORKOUT_GUIDE, type GuideSection } from "@/lib/guide-content";
import { useAuthGuard } from "@/lib/use-auth";

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
  const [tab, setTab] = useState<"food" | "workout">("food");
  if (auth.loading) return <Loading />;
  if (!auth.profile) return null;
  const list = tab === "food" ? NUTRITION_GUIDE : WORKOUT_GUIDE;

  return (
    <ClientShell title="دليلك" sub="كل اللي تحتاجين تعرفينه، من المدربة زهراء">
      <div className="seg-tabs" role="tablist" aria-label="أقسام الدليل">
        <button type="button" role="tab" aria-selected={tab === "food"} onClick={() => setTab("food")}>🥗 التغذية</button>
        <button type="button" role="tab" aria-selected={tab === "workout"} onClick={() => setTab("workout")}>🏋️‍♀️ التمارين</button>
      </div>
      {list.map((s, i) => (
        <Section key={`${tab}-${s.title}`} s={s} open={i === 0} />
      ))}
    </ClientShell>
  );
}
