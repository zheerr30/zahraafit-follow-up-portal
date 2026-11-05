"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { CoachShell, Loading, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { CoachDishes } from "@/components/CoachDishes";
import { CoachRestaurants } from "@/components/CoachRestaurants";
import { useAuthGuard } from "@/lib/use-auth";
import type { Article, Challenge } from "@/lib/types";

type ArticleDraft = { id?: string; emoji: string; title: string; body: string; published: boolean };
type ChallengeDraft = { id?: string; emoji: string; title: string; description: string; starts_on: string; ends_on: string };

/** This week, Sunday to Saturday, as yyyy-mm-dd. */
function thisWeek() {
  const t = new Date(todayKey() + "T12:00:00");
  const start = new Date(t);
  start.setDate(t.getDate() - t.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const k = (d: Date) => d.toISOString().slice(0, 10);
  return { start: k(start), end: k(end) };
}

const MISSING_DB = "قاعدة البيانات تحتاج تحديث: شغلي ملف phase3-content.sql في Supabase.";

export default function ContentPage() {
  const auth = useAuthGuard("admin");
  const toast = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [challenges, setChallenges] = useState<(Challenge & { people: number; checks: number })[]>([]);
  const [art, setArt] = useState<ArticleDraft | null>(null);
  const [ch, setCh] = useState<ChallengeDraft | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [a, c, k] = await Promise.all([
      supabase.from("articles").select("*").order("created_at", { ascending: false }),
      supabase.from("challenges").select("*").order("starts_on", { ascending: false }),
      supabase.from("challenge_checkins").select("challenge_id, client_id")
    ]);
    if (a.error || c.error) setError(MISSING_DB);
    setArticles((a.data as Article[] | null) || []);
    const checks = (k.data as { challenge_id: string; client_id: string }[] | null) || [];
    setChallenges(
      ((c.data as Challenge[] | null) || []).map((x) => {
        const mine = checks.filter((q) => q.challenge_id === x.id);
        return { ...x, people: new Set(mine.map((q) => q.client_id)).size, checks: mine.length };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (auth.profile) load();
  }, [auth.profile, load]);

  async function saveArticle(e: FormEvent) {
    e.preventDefault();
    if (!art) return;
    if (art.title.trim().length < 2) return setError("اكتبي عنوان المقال.");
    if (!art.body.trim()) return setError("اكتبي نص المقال.");
    setBusy(true);
    setError(null);
    const row = { emoji: art.emoji.trim() || null, title: art.title.trim(), body: art.body.trim(), published: art.published, published_at: art.published ? new Date().toISOString() : null };
    const res = art.id ? await supabase.from("articles").update(row).eq("id", art.id) : await supabase.from("articles").insert(row);
    setBusy(false);
    if (res.error) return setError(res.error.code === "42P01" ? MISSING_DB : "ما انحفظ المقال. جربي مرة ثانية.");
    toast.show(art.published ? "نشرنا المقال للمشتركات" : "حفظنا المقال كمسودة");
    setArt(null);
    load();
  }

  async function togglePublish(a: Article) {
    const { error: err } = await supabase.from("articles").update({ published: !a.published, published_at: !a.published ? new Date().toISOString() : a.published_at }).eq("id", a.id);
    if (err) return setError("ما قدرنا نحدث المقال.");
    toast.show(a.published ? "خفينا المقال" : "نشرنا المقال");
    load();
  }

  async function saveChallenge(e: FormEvent) {
    e.preventDefault();
    if (!ch) return;
    if (ch.title.trim().length < 2) return setError("اكتبي عنوان التحدي.");
    if (!ch.starts_on || !ch.ends_on || ch.ends_on < ch.starts_on) return setError("تاريخ النهاية لازم يكون بعد البداية.");
    setBusy(true);
    setError(null);
    const row = { emoji: ch.emoji.trim() || null, title: ch.title.trim(), description: ch.description.trim(), starts_on: ch.starts_on, ends_on: ch.ends_on };
    const res = ch.id ? await supabase.from("challenges").update(row).eq("id", ch.id) : await supabase.from("challenges").insert(row);
    setBusy(false);
    if (res.error) return setError(res.error.code === "42P01" ? MISSING_DB : res.error.message.includes("challenges_dates") ? "مدة التحدي لازم تكون ٦٠ يوم أو أقل." : "ما انحفظ التحدي. جربي مرة ثانية.");
    toast.show("حفظنا التحدي");
    setCh(null);
    load();
  }

  async function remove(kind: "articles" | "challenges", id: string) {
    const { error: err } = await supabase.from(kind).delete().eq("id", id);
    setConfirmDel(null);
    if (err) return setError("ما قدرنا نحذف. جربي مرة ثانية.");
    toast.show("انحذف");
    load();
  }

  if (auth.loading || loading) return <Loading />;
  if (!auth.profile) return null;
  const today = todayKey();

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>المحتوى</h1>
      {error ? <p className="alert err" role="alert">{error}</p> : null}

      <div className="sec-title">
        <span className="em" aria-hidden="true">📰</span>
        <h2>المقالات</h2>
        <button type="button" className="btn btn-p btn-sm" style={{ marginInlineStart: "auto" }} onClick={() => { setError(null); setArt({ emoji: "📰", title: "", body: "", published: true }); }}>
          <Plus />
          مقال جديد
        </button>
      </div>

      {art ? (
        <form className="card stack" onSubmit={saveArticle}>
          <div className="row between">
            <b>{art.id ? "تعديل المقال" : "مقال جديد"}</b>
            <button type="button" className="icon-btn" aria-label="إلغاء" onClick={() => setArt(null)}><X /></button>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ width: 80 }}>
              <label htmlFor="a-emoji">إيموجي</label>
              <input id="a-emoji" className="inp" style={{ textAlign: "center", fontSize: 22 }} value={art.emoji} onChange={(e) => setArt({ ...art, emoji: e.target.value })} maxLength={4} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="a-title">العنوان</label>
              <input id="a-title" className="inp" value={art.title} onChange={(e) => setArt({ ...art, title: e.target.value })} placeholder="مثلًا: ليش الوزن يثبت بعد أسبوعين؟" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="a-body">المقال</label>
            <textarea id="a-body" className="inp" style={{ minHeight: 260 }} value={art.body} onChange={(e) => setArt({ ...art, body: e.target.value })} placeholder="اكتبي المقال هنا. كل سطر فاضي يبدأ فقرة جديدة." />
          </div>
          <label className="consent">
            <input type="checkbox" checked={art.published} onChange={(e) => setArt({ ...art, published: e.target.checked })} />
            <span>انشريه للمشتركات الحين (إذا ما علمتي، ينحفظ مسودة ما يشوفونها)</span>
          </label>
          <button className="btn btn-p" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" /> : null}حفظ</button>
        </form>
      ) : null}

      {articles.length ? (
        <div className="stack" style={{ gap: 10 }}>
          {articles.map((a) => (
            <div key={a.id} className="card row" style={{ padding: 14 }}>
              <span style={{ fontSize: 24 }} aria-hidden="true">{a.emoji || "📰"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{a.title}</b>
                <div className="small muted">{a.published ? `منشور ${a.published_at ? formatDate(a.published_at) : ""}` : "مسودة"}</div>
              </div>
              {confirmDel === a.id ? (
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-s btn-sm" onClick={() => setConfirmDel(null)}>لا</button>
                  <button type="button" className="btn btn-p btn-sm" onClick={() => remove("articles", a.id)}>احذفي</button>
                </span>
              ) : (
                <span className="row" style={{ gap: 2 }}>
                  <button type="button" className="icon-btn" aria-label={a.published ? "خفي المقال" : "انشري المقال"} title={a.published ? "خفي" : "انشري"} onClick={() => togglePublish(a)}>{a.published ? <Eye /> : <EyeOff />}</button>
                  <button type="button" className="icon-btn" aria-label="عدلي" onClick={() => { setError(null); setArt({ id: a.id, emoji: a.emoji || "", title: a.title, body: a.body, published: a.published }); window.scrollTo({ top: 0 }); }}><Pencil /></button>
                  <button type="button" className="icon-btn" aria-label="احذفي" onClick={() => setConfirmDel(a.id)}><Trash2 /></button>
                </span>
              )}
            </div>
          ))}
        </div>
      ) : !art ? (
        <p className="note">ما كتبتي مقالات للحين. آخر مقال تنشرينه يطلع للمشتركات في الرئيسية، وكل المقالات في «دليلك».</p>
      ) : null}

      <div className="sec-title" style={{ marginTop: 14 }}>
        <span className="em" aria-hidden="true">🏆</span>
        <h2>التحديات</h2>
        <button type="button" className="btn btn-p btn-sm" style={{ marginInlineStart: "auto" }} onClick={() => { setError(null); const w = thisWeek(); setCh({ emoji: "🏆", title: "", description: "", starts_on: w.start, ends_on: w.end }); }}>
          <Plus />
          تحدي جديد
        </button>
      </div>

      {ch ? (
        <form className="card stack" onSubmit={saveChallenge}>
          <div className="row between">
            <b>{ch.id ? "تعديل التحدي" : "تحدي جديد"}</b>
            <button type="button" className="icon-btn" aria-label="إلغاء" onClick={() => setCh(null)}><X /></button>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ width: 80 }}>
              <label htmlFor="c-emoji">إيموجي</label>
              <input id="c-emoji" className="inp" style={{ textAlign: "center", fontSize: 22 }} value={ch.emoji} onChange={(e) => setCh({ ...ch, emoji: e.target.value })} maxLength={4} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="c-title">التحدي</label>
              <input id="c-title" className="inp" value={ch.title} onChange={(e) => setCh({ ...ch, title: e.target.value })} placeholder="مثلًا: ١٠ آلاف خطوة كل يوم" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-desc">التفاصيل (اختياري)</label>
            <textarea id="c-desc" className="inp" value={ch.description} onChange={(e) => setCh({ ...ch, description: e.target.value })} placeholder="مثلًا: امشي بعد العشاء ٣٠ دقيقة، وعلمي على اليوم اللي تكملين فيه." />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="c-start">يبدأ</label>
              <input id="c-start" type="date" className="inp" value={ch.starts_on} onChange={(e) => setCh({ ...ch, starts_on: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="c-end">ينتهي</label>
              <input id="c-end" type="date" className="inp" value={ch.ends_on} onChange={(e) => setCh({ ...ch, ends_on: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-p" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" /> : null}حفظ</button>
        </form>
      ) : null}

      {challenges.length ? (
        <div className="stack" style={{ gap: 10 }}>
          {challenges.map((c) => {
            const status = today < c.starts_on ? ["يبدأ قريب", "blue"] : today > c.ends_on ? ["خلص", ""] : ["شغال الحين", "green"];
            return (
              <div key={c.id} className="card row" style={{ padding: 14 }}>
                <span style={{ fontSize: 24 }} aria-hidden="true">{c.emoji || "🏆"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="row wrap" style={{ gap: 6 }}><b>{c.title}</b><span className={`chip ${status[1]}`}>{status[0]}</span></span>
                  <div className="small muted">{formatDate(c.starts_on)} ← {formatDate(c.ends_on)} · {c.people} مشتركة شاركت · {c.checks} يوم انجز</div>
                </div>
                {confirmDel === c.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-s btn-sm" onClick={() => setConfirmDel(null)}>لا</button>
                    <button type="button" className="btn btn-p btn-sm" onClick={() => remove("challenges", c.id)}>احذفي</button>
                  </span>
                ) : (
                  <span className="row" style={{ gap: 2 }}>
                    <button type="button" className="icon-btn" aria-label="عدلي" onClick={() => { setError(null); setCh({ id: c.id, emoji: c.emoji || "", title: c.title, description: c.description, starts_on: c.starts_on, ends_on: c.ends_on }); }}><Pencil /></button>
                    <button type="button" className="icon-btn" aria-label="احذفي" onClick={() => setConfirmDel(c.id)}><Trash2 /></button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : !ch ? (
        <p className="note">ما سويتي تحديات للحين. التحدي الشغال يطلع للمشتركات في الرئيسية، ويعلمون على كل يوم يكملونه.</p>
      ) : null}
      <CoachDishes />
      <CoachRestaurants />
      {toast.node}
    </CoachShell>
  );
}
