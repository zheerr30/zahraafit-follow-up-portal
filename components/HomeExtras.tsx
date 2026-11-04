"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import type { Article, Challenge } from "@/lib/types";

const DAY_NAMES = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function daysBetween(start: string, end: string) {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  while (d <= e && out.length < 61) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Home: the latest article and this week's challenge. Renders nothing if neither exists. */
export function HomeExtras({ clientId }: { clientId: string }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const today = todayKey();

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: c }] = await Promise.all([
        supabase.from("articles").select("*").eq("published", true).order("published_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("challenges").select("*").lte("starts_on", today).gte("ends_on", today).order("starts_on", { ascending: false }).limit(1).maybeSingle()
      ]);
      setArticle((a as Article | null) || null);
      const ch = (c as Challenge | null) || null;
      setChallenge(ch);
      if (ch) {
        const { data: k } = await supabase.from("challenge_checkins").select("day").eq("challenge_id", ch.id).eq("client_id", clientId);
        setDone(new Set(((k as { day: string }[] | null) || []).map((x) => x.day)));
      }
    })();
  }, [clientId, today]);

  async function toggleToday() {
    if (!challenge || busy) return;
    setBusy(true);
    const had = done.has(today);
    const res = had
      ? await supabase.from("challenge_checkins").delete().eq("challenge_id", challenge.id).eq("client_id", clientId).eq("day", today)
      : await supabase.from("challenge_checkins").insert({ challenge_id: challenge.id, client_id: clientId, day: today });
    setBusy(false);
    if (res.error) return;
    const next = new Set(done);
    if (had) next.delete(today);
    else next.add(today);
    setDone(next);
  }

  if (!article && !challenge) return null;
  const days = challenge ? daysBetween(challenge.starts_on, challenge.ends_on) : [];

  return (
    <>
      {challenge ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">🏆</span>
            <h2>تحدي الأسبوع</h2>
            <span className="aside">{done.size} من {days.length} أيام</span>
          </div>
          <section className="card stack">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{challenge.emoji || "🏆"}</span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 16, color: "var(--navy)" }}>{challenge.title}</b>
                {challenge.description ? <p className="small muted" style={{ whiteSpace: "pre-line" }}>{challenge.description}</p> : null}
              </div>
            </div>
            <div className="row" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {days.map((d) => {
                const on = done.has(d);
                const isToday = d === today;
                return (
                  <span key={d} style={{ flex: "1 0 38px", textAlign: "center", fontSize: 11, color: "var(--ink-3)" }}>
                    {DAY_NAMES[new Date(d + "T12:00:00").getDay()]}
                    <span style={{ display: "grid", placeItems: "center", margin: "4px auto 0", width: 34, height: 34, borderRadius: "50%", background: on ? "var(--green)" : "var(--sunken)", color: on ? "#fff" : "var(--ink-3)", border: isToday && !on ? "2px solid var(--navy)" : "0" }}>
                      {on ? <Check size={16} /> : new Date(d + "T12:00:00").getDate()}
                    </span>
                  </span>
                );
              })}
            </div>
            <button type="button" className={`btn btn-block ${done.has(today) ? "btn-s" : "btn-p"}`} onClick={toggleToday} disabled={busy}>
              {done.has(today) ? "✅ خلصتيه اليوم (اضغطي للتراجع)" : "💪 خلصت تحدي اليوم"}
            </button>
          </section>
        </>
      ) : null}

      {article ? (
        <>
          <div className="sec-title">
            <span className="em" aria-hidden="true">📰</span>
            <h2>مقال الأسبوع</h2>
            <Link className="aside link" href="/app/guide?tab=articles" style={{ minHeight: 0 }}>كل المقالات</Link>
          </div>
          <Link href={`/app/articles/${article.id}`} className="card row" style={{ alignItems: "flex-start" }}>
            <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{article.emoji || "📰"}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 16, color: "var(--navy)", display: "block" }}>{article.title}</b>
              <span className="small muted" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{article.body}</span>
            </span>
            <ChevronLeft size={18} color="var(--ink-3)" style={{ flexShrink: 0, alignSelf: "center" }} />
          </Link>
        </>
      ) : null}
    </>
  );
}
