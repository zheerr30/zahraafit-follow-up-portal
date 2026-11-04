"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Dumbbell, FileText, History, Info, Play, PlayCircle, X } from "lucide-react";
import { ClientShell, Empty, Loading, Rings, useToast } from "@/components/ui";
import { muscleImage, repRange, restSeconds, type Exercise } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";

type SetEntry = { w: string; r: string; done: boolean };
type LogItem = { id: string; name: string; sets: { w: number; r: number }[] };
type WorkoutLog = { id: string; plan_id: string | null; day_index: number; day_title: string | null; performed_on: string; duration_sec: number | null; items: LogItem[]; created_at: string };
type Session = { dayIndex: number; title: string; exercises: Exercise[]; sets: SetEntry[][]; t0: number; quitAsk?: boolean };
type Rest = { end: number; total: number; next: string };

const clk = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const toEn = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, ".");

export default function WorkoutPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const toast = useToast();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ title: string; sets: number; vol: number; min: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const plan = cp.workout;
  const row = cp.workoutRow;

  const loadLogs = useCallback(async () => {
    if (!cp.client) return;
    const { data } = await supabase.from("workout_logs").select("*").eq("client_id", cp.client.id).order("created_at", { ascending: false }).limit(60);
    setLogs((data as WorkoutLog[] | null) || []);
  }, [cp.client]);

  useEffect(() => {
    if (cp.loading) return;
    loadLogs().then(() => setReady(true));
  }, [cp.loading, loadLogs]);

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => {
    if (rest && now >= rest.end) {
      setRest(null);
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
      toast.show("خلصت الراحة، يلا الجولة الجاية");
    }
  }, [now, rest, toast]);

  if (auth.loading || cp.loading || !ready) return <Loading />;
  if (!auth.profile) return null;

  if (!plan || !row) {
    return (
      <ClientShell title="تماريني">
        <Empty icon={<Dumbbell />} title="خطتك الرياضية بتطلع هنا">
          {cp.files.length ? (
            <>
              المدربة أرسلت خطتك كملف. <Link className="link" href="/app">افتحيها من الرئيسية</Link>
            </>
          ) : (
            "أول ما ترسل المدربة خطتك، تشوفين تمارينك هنا وتسجلين أوزانك وتكراراتك."
          )}
        </Empty>
      </ClientShell>
    );
  }

  const planLogs = logs.filter((l) => l.plan_id === row.id);
  const nextIdx = planLogs.length ? (planLogs[0].day_index + 1) % plan.days.length : 0;
  const weekStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  })();
  const thisWeek = logs.filter((l) => new Date(l.created_at).getTime() >= weekStart).length;
  const lastFor = (id: string) => {
    for (const l of logs) {
      const it = l.items.find((x) => x.id === id);
      if (it && it.sets.length) return it;
    }
    return null;
  };
  const pdf = cp.pdfs.find((f) => /رياضي/.test(f.title)) || cp.pdfs.find((f) => f.kind === "workout");

  function start(i: number) {
    const d = plan!.days[i];
    setSession({
      dayIndex: i,
      title: d.title,
      exercises: d.exercises,
      t0: Date.now(),
      sets: d.exercises.map((e) => {
        const last = lastFor(e.id);
        const [lo] = repRange(e.reps);
        return Array.from({ length: e.sets }, (_, k) => {
          const ls = last?.sets[Math.min(k, (last?.sets.length || 1) - 1)];
          return { w: ls?.w ? String(ls.w) : "", r: String(lo), done: false };
        });
      })
    });
    setNow(Date.now());
    setTimeout(() => overlayRef.current?.scrollTo({ top: 0 }), 0);
  }

  function toggleSet(ei: number, k: number) {
    if (!session) return;
    const sets = session.sets.map((s) => s.map((x) => ({ ...x })));
    sets[ei][k].done = !sets[ei][k].done;
    setSession({ ...session, sets });
    if (sets[ei][k].done) {
      const e = session.exercises[ei];
      const all = sets[ei].every((x) => x.done);
      const nx = session.exercises[ei + 1];
      const secs = restSeconds(e.rest);
      if (!all) setRest({ end: Date.now() + secs * 1000, total: secs, next: `الجولة الجاية من ${e.name}` });
      else if (nx) setRest({ end: Date.now() + secs * 1000, total: secs, next: `التمرين الجاي: ${nx.name}` });
    }
  }

  function edit(ei: number, k: number, field: "w" | "r", v: string) {
    if (!session) return;
    const sets = session.sets.map((s) => s.map((x) => ({ ...x })));
    sets[ei][k][field] = toEn(v);
    setSession({ ...session, sets });
  }

  async function finish() {
    if (!session || !cp.client) return;
    const items: LogItem[] = session.exercises
      .map((e, i) => ({ id: e.id, name: e.name, sets: session.sets[i].filter((x) => x.done).map((x) => ({ w: Number(x.w) || 0, r: Number(x.r) || 0 })) }))
      .filter((x) => x.sets.length);
    if (!items.length) return toast.show("علّمي على جولة وحدة على الأقل قبل ما تخلصين");
    setSaving(true);
    const dur = Math.round((Date.now() - session.t0) / 1000);
    const { error } = await supabase.from("workout_logs").insert({ client_id: cp.client.id, plan_id: row!.id, day_index: session.dayIndex, day_title: session.title, duration_sec: dur, items });
    setSaving(false);
    if (error) return toast.show("ما انحفظ التمرين. تأكدي من الاتصال وجربي مرة ثانية.");
    const vol = items.reduce((a, it) => a + it.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
    setDone({ title: session.title, sets: items.reduce((a, it) => a + it.sets.length, 0), vol: Math.round(vol), min: Math.max(1, Math.round(dur / 60)) });
    setSession(null);
    setRest(null);
    loadLogs();
  }

  return (
    <ClientShell title="تماريني" action={pdf ? <a className="btn btn-g btn-sm" href={pdf.href} target={pdf.external ? "_blank" : undefined} rel="noreferrer"><FileText />PDF</a> : undefined}>
      <section className="photo-hero">
        <span className="kicker">💪 تمرينك الجاي · تمارين هالأسبوع {thisWeek}</span>
        <h2>{plan.days[nextIdx].title}</h2>
        <p>{plan.days[nextIdx].exercises.length} تمارين · خذي وقتك بين الجولات</p>
        <button type="button" className="btn btn-p btn-block" onClick={() => start(nextIdx)}>
          <Play />
          ابدئي التمرين
        </button>
      </section>

      <div className="sec-title">
        <span className="em" aria-hidden="true">📅</span>
        <h2>جدولك</h2>
        <span className="aside">{plan.days.length} أيام بالأسبوع</span>
      </div>

      {plan.days.map((d, i) => (
        <section key={i} className="dcard" aria-label={d.title}>
          <div className="dcard-h">
            <span className="dnum">{d.n}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3>{d.title}</h3>
              <span className="s">{d.exercises.length} تمارين{i === nextIdx ? " · التمرين الجاي" : ""}</span>
            </div>
            <button type="button" className={`btn btn-sm ${i === nextIdx ? "btn-p" : "btn-on-navy"}`} onClick={() => start(i)}>
              <Play />
              ابدئي
            </button>
          </div>
          {d.exercises.map((e, k) => {
            const img = muscleImage(e.muscle);
            return (
              <div key={k} className="xrow">
                {img ? <img src={img} alt="" onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }} /> : null}
                <div className="nm">
                  <b>{e.name}</b>
                  {e.en ? <div className="en">{e.en}</div> : null}
                  {e.alt ? <div className="note">↔ بديل: {e.alt.name}</div> : null}
                </div>
                <div className="xstats">
                  <div><b>{e.sets}</b><span>جولات</span></div>
                  <div><b>{e.reps}</b><span>عدة</span></div>
                </div>
                {e.video ? (
                  <a className="yt" href={e.video} target="_blank" rel="noreferrer" aria-label={`فيديو ${e.name}`}>
                    <Play />
                  </a>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}

      {session ? (
        <div className="overlay" ref={overlayRef} role="dialog" aria-modal="true" aria-label={session.title}>
          <div className="app">
            <div className="s-top gutter">
              <button type="button" className="icon-btn" aria-label="إنهاء بدون حفظ" onClick={() => setSession({ ...session, quitAsk: true })}>
                <X />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block" }}>{session.title}</b>
                <span className="small muted">
                  {session.sets.flat().filter((x) => x.done).length} من {session.sets.flat().length} جولة
                </span>
              </div>
              <span className="clock">{clk(Math.floor((now - session.t0) / 1000))}</span>
            </div>
            <div className="s-prog">
              <i style={{ width: `${(session.sets.flat().filter((x) => x.done).length / Math.max(1, session.sets.flat().length)) * 100}%` }} />
            </div>
            <div className="screen gutter" style={{ paddingBottom: rest ? 150 : 40 }}>
              {session.quitAsk ? (
                <div className="alert info stack">
                  <b>تطلعين بدون ما تحفظين؟ الجولات اللي سجلتيها بتروح.</b>
                  <div className="row">
                    <button type="button" className="btn btn-s btn-sm" style={{ flex: 1 }} onClick={() => setSession({ ...session, quitAsk: false })}>كمّلي التمرين</button>
                    <button type="button" className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={() => { setSession(null); setRest(null); }}>اطلعي</button>
                  </div>
                </div>
              ) : null}
              {session.exercises.map((e, i) => {
                const last = lastFor(e.id);
                const [, hi] = repRange(e.reps);
                const hitTop = last && last.sets.length && last.sets.every((x) => x.r >= hi);
                const complete = session.sets[i].every((x) => x.done);
                const img = muscleImage(e.muscle);
                return (
                  <article key={i} className={`exc ${complete ? "complete" : ""}`}>
                    <div className="exc-media">
                      {img ? <img src={img} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{ fontSize: 16.5 }}>{e.name}</h3>
                        <span className="small muted">{e.sets} جولات × {e.reps} · راحة {e.rest}</span>
                      </div>
                      {e.video ? (
                        <a className="icon-btn" href={e.video} target="_blank" rel="noreferrer" aria-label={`فيديو ${e.name}`} style={{ color: "#E03A2F" }}>
                          <PlayCircle />
                        </a>
                      ) : null}
                    </div>
                    <div className="exc-b">
                      {e.tip ? <div className="hint"><Info />{e.tip}</div> : null}
                      <div className={`hint ${hitTop ? "up" : ""}`}>
                        {!last ? (
                          <><Info />أول مرة؟ ابدئي بوزن تقدرين تسوين فيه {hi} تكرار بشكل صحيح.</>
                        ) : hitTop ? (
                          <><ArrowUp />آخر مرة كملتي {hi} تكرار في كل الجولات. زيدي الوزن شوي هالمرة.</>
                        ) : (
                          <><History />آخر مرة: <span dir="ltr">{last.sets.map((x) => (x.w ? `${x.w}×` : "") + x.r).join("  ")}</span></>
                        )}
                      </div>
                      {e.alt ? (
                        <div className="note">
                          ما تقدرين عليه؟ بديله: <b>{e.alt.name}</b>
                          {e.alt.video ? <> · <a className="link" style={{ minHeight: 0, fontSize: 12.5 }} href={e.alt.video} target="_blank" rel="noreferrer">فيديو</a></> : null}
                        </div>
                      ) : null}
                      <div className="sets">
                        <span className="hd">جولة</span>
                        <span className="hd">الوزن (كجم)</span>
                        <span className="hd">تكرار</span>
                        <span className="hd">تم</span>
                        {session.sets[i].map((x, k) => (
                          <SetRow key={k} k={k} x={x} onW={(v) => edit(i, k, "w", v)} onR={(v) => edit(i, k, "r", v)} onDone={() => toggleSet(i, k)} />
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
              <button type="button" className="btn btn-p btn-block" disabled={saving} onClick={finish}>
                <Check />
                خلّصت التمرين
              </button>
            </div>
          </div>
          {rest ? (
            <div className="rest" role="timer">
              <div className="rest-bar"><i style={{ width: `${(Math.max(0, rest.end - now) / 1000 / rest.total) * 100}%` }} /></div>
              <div className="rest-in">
                <span className="t">{clk(Math.max(0, Math.ceil((rest.end - now) / 1000)))}</span>
                <span className="l"><b>وقت الراحة</b>{rest.next}</span>
                <button type="button" aria-label="زيدي ١٥ ثانية" onClick={() => setRest({ ...rest, end: rest.end + 15000, total: rest.total + 15 })}>+15</button>
                <button type="button" onClick={() => setRest(null)}>تخطّي</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {done ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="ملخص التمرين">
          <div className="app screen gutter" style={{ paddingTop: 60, alignItems: "center", textAlign: "center" }}>
            <span className="avatar" style={{ width: 84, height: 84, background: "var(--clay)", color: "var(--on-clay)" }}><Check size={40} /></span>
            <h1 style={{ fontSize: 26 }}>عاشت يدك</h1>
            <p className="muted">خلّصتي {done.title}. المدربة تشوف أوزانك.</p>
            <div className="grid3" style={{ width: "100%" }}>
              <div className="stat"><b>{done.min}</b><span>دقيقة</span></div>
              <div className="stat"><b>{done.sets}</b><span>جولة</span></div>
              <div className="stat"><b>{done.vol}</b><span>كجم رفعتيها</span></div>
            </div>
            <button type="button" className="btn btn-p btn-block" onClick={() => setDone(null)}>تمام</button>
          </div>
        </div>
      ) : null}
      {toast.node}
    </ClientShell>
  );
}

function SetRow({ k, x, onW, onR, onDone }: { k: number; x: SetEntry; onW: (v: string) => void; onR: (v: string) => void; onDone: () => void }) {
  return (
    <>
      <span className="n">{k + 1}</span>
      <input aria-label={`وزن الجولة ${k + 1}`} inputMode="decimal" placeholder="0" value={x.w} onChange={(e) => onW(e.target.value)} />
      <input aria-label={`تكرار الجولة ${k + 1}`} inputMode="numeric" value={x.r} onChange={(e) => onR(e.target.value)} />
      <button type="button" className="chk" aria-pressed={x.done} aria-label={`خلصت الجولة ${k + 1}`} onClick={onDone}>
        <Check />
      </button>
    </>
  );
}
