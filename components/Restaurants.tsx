"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight, Plus, Search } from "lucide-react";
import { aiRead } from "@/lib/food-scan";
import { norm } from "@/lib/foods";
import { supabase } from "@/lib/supabase";

export type Restaurant = { id: string; name: string; emoji: string | null };
export type RestItem = { id: string; restaurant_id: string; name: string; cal: number; p: number | null; c: number | null; f: number | null; coach_pick: boolean; tip: string | null };
type Row = { name: string; amount: number; unit: string; cal: number; p: number; c: number; f: number };
type View = { v: "list" } | { v: "rest"; r: Restaurant } | { v: "item"; r: Restaurant } | { v: "menu"; r: Restaurant } | { v: "newRest" };

/** «🍔 مطاعم» in «سعراتي»: pick a restaurant, add a menu item, or read a menu photo. */
export function Restaurants({ profileId, left = null, onAdd, onBack }: { profileId: string; left?: number | null; onAdd: (row: Row) => void; onBack: () => void }) {
  const [rests, setRests] = useState<Restaurant[] | null>(null);
  const [items, setItems] = useState<RestItem[]>([]);
  const [view, setView] = useState<View>({ v: "list" });
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fit, setFit] = useState<(RestItem & { restaurants: { name: string; emoji: string | null } | null })[]>([]);

  useEffect(() => {
    // «يناسب الباقي لك»: items that don't go over what's left today, the coach's picks first.
    if (!left || left <= 0) return;
    supabase.from("restaurant_items").select("*, restaurants(name, emoji)").lte("cal", left).gt("cal", 0).order("coach_pick", { ascending: false }).order("cal", { ascending: false }).limit(8)
      .then(({ data }) => setFit((data as typeof fit | null) || []));
  }, [left]);

  useEffect(() => {
    supabase.from("restaurants").select("id, name, emoji").order("name").then(({ data, error }) => {
      if (error) setErr("المطاعم لسا ما تفعلت. المدربة بتفعلها قريب.");
      setRests((data as Restaurant[] | null) || []);
    });
  }, []);

  async function open(r: Restaurant) {
    setView({ v: "rest", r });
    setItems([]);
    const { data } = await supabase.from("restaurant_items").select("*").eq("restaurant_id", r.id).order("name");
    setItems((data as RestItem[] | null) || []);
  }

  const shown = useMemo(() => {
    const k = norm(q);
    return (rests || []).filter((r) => !k || norm(r.name).includes(k));
  }, [rests, q]);

  const pick = (r: Restaurant, it: RestItem) =>
    onAdd({ name: `${it.name} (${r.name})`, amount: 1, unit: "طلب", cal: Number(it.cal), p: Number(it.p) || 0, c: Number(it.c) || 0, f: Number(it.f) || 0 });

  if (view.v === "list") {
    return (
      <div className="stack">
        <div className="unit">
          <label htmlFor="rest-q" className="sr-only">ابحثي عن مطعم</label>
          <input id="rest-q" className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي عن مطعم" />
          <span><Search size={16} /></span>
        </div>
        {err ? <p className="alert info">{err}</p> : null}
        {fit.length && !q.trim() ? (
          <>
            <span className="label">يناسب الباقي لك ({left} سعرة)</span>
            <div className="card" style={{ padding: "2px 12px" }}>
              {fit.map((it) => (
                <button key={it.id} type="button" className="diary-row rest-pick" onClick={() => onAdd({ name: `${it.name} (${it.restaurants?.name || ""})`, amount: 1, unit: "طلب", cal: Number(it.cal), p: Number(it.p) || 0, c: Number(it.c) || 0, f: Number(it.f) || 0 })}>
                  <span aria-hidden="true" style={{ fontSize: 20, flex: "none" }}>{it.restaurants?.emoji || "🍽️"}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    {it.coach_pick ? "⭐ " : ""}{it.name}
                    <span className="note" style={{ display: "block" }}>{it.restaurants?.name}{it.tip ? ` · 💡 ${it.tip}` : ""}</span>
                  </span>
                  <b className="num" style={{ flex: "none" }}>{Math.round(Number(it.cal))}</b>
                </button>
              ))}
            </div>
            <span className="label">كل المطاعم</span>
          </>
        ) : null}
        {rests === null ? <p className="note">لحظة...</p> : (
          <div className="rest-grid">
            {shown.map((r) => (
              <button key={r.id} type="button" onClick={() => open(r)}>
                <span aria-hidden="true">{r.emoji || "🍽️"}</span>
                {r.name}
              </button>
            ))}
            <button type="button" className="add" onClick={() => setView({ v: "newRest" })}>
              <span aria-hidden="true">➕</span>
              {q.trim() && !shown.length ? `أضيفي «${q.trim()}»` : "مطعم ثاني"}
            </button>
          </div>
        )}
        <button type="button" className="btn btn-g" onClick={onBack}>رجوع</button>
      </div>
    );
  }

  if (view.v === "newRest") {
    return <NewRestaurant initial={q.trim()} profileId={profileId} onDone={(r) => { setRests((l) => [...(l || []), r]); open(r); }} onBack={() => setView({ v: "list" })} />;
  }

  const r = view.r;
  if (view.v === "item") return <NewItem r={r} profileId={profileId} onDone={(it) => { setItems((l) => [...l, it]); setView({ v: "rest", r }); }} onBack={() => setView({ v: "rest", r })} />;
  if (view.v === "menu") return <MenuPhoto r={r} profileId={profileId} onDone={(added) => { setItems((l) => [...l, ...added]); setView({ v: "rest", r }); }} onBack={() => setView({ v: "rest", r })} />;

  const picks = items.filter((i) => i.coach_pick);
  const rest = items.filter((i) => !i.coach_pick);
  return (
    <div className="stack">
      <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setView({ v: "list" })}><ChevronRight size={16} />المطاعم</button>
      <b style={{ fontSize: 18 }}>{r.emoji || "🍽️"} {r.name}</b>
      {picks.length ? (
        <>
          <span className="label">⭐ اختيارات المدربة</span>
          <div className="opts">
            {picks.map((it) => (
              <button key={it.id} type="button" className="opt" onClick={() => pick(r, it)} style={{ borderColor: "var(--clay)" }}>
                <span style={{ minWidth: 0 }}>
                  <span className="opt-t">{it.name}</span>
                  <span className="opt-s">{Number(it.cal)} سعرة{it.p ? <> · <Dot k="p" />{Number(it.p)}</> : ""}{it.tip ? ` · 💡 ${it.tip}` : ""}</span>
                </span>
                <Plus size={18} color="var(--clay)" style={{ flexShrink: 0, marginInlineStart: "auto" }} />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {rest.length ? (
        <>
          {picks.length ? <span className="label">كل الأصناف</span> : null}
          <div className="opts">
            {rest.map((it) => (
              <button key={it.id} type="button" className="opt" onClick={() => pick(r, it)}>
                <span style={{ minWidth: 0 }}>
                  <span className="opt-t">{it.name}</span>
                  <span className="opt-s">{Number(it.cal)} سعرة{it.p ? <> · <MacLine p={Number(it.p)} c={Number(it.c) || 0} f={Number(it.f) || 0} /></> : ""}</span>
                </span>
                <Plus size={18} color="var(--clay)" style={{ flexShrink: 0, marginInlineStart: "auto" }} />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {!items.length ? <p className="alert info">ما فيه أصناف لهالمطعم للحين. السعرات مكتوبة في المنيو، صوريه ونضيفها للكل 🙌</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-p" style={{ flex: 1 }} onClick={() => setView({ v: "menu", r })}><Camera size={17} />صوري المنيو</button>
        <button type="button" className="btn btn-s" onClick={() => setView({ v: "item", r })}><Plus size={17} />صنف</button>
      </div>
    </div>
  );
}

function NewRestaurant({ initial, profileId, onDone, onBack }: { initial: string; profileId: string; onDone: (r: Restaurant) => void; onBack: () => void }) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { data, error } = await supabase.from("restaurants").insert({ name: name.trim(), added_by: profileId }).select("id, name, emoji").single();
    if (error || !data) return setErr(error?.code === "23505" ? "هالمطعم موجود، دوريه في القائمة." : "ما انحفظ. جربي مرة ثانية.");
    onDone(data as Restaurant);
  }
  return (
    <form className="stack" onSubmit={save}>
      <div className="field">
        <label htmlFor="rest-name">اسم المطعم</label>
        <input id="rest-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلًا: مطعم ..." autoFocus />
      </div>
      {err ? <p className="alert err">{err}</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-g" onClick={onBack}>رجوع</button>
        <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={!name.trim()}>أضيفيه</button>
      </div>
    </form>
  );
}

function NewItem({ r, profileId, onDone, onBack }: { r: Restaurant; profileId: string; onDone: (it: RestItem) => void; onBack: () => void }) {
  const [f, setF] = useState({ name: "", cal: "", p: "", c: "", fat: "" });
  const [err, setErr] = useState<string | null>(null);
  const n = (k: "cal" | "p" | "c" | "fat", l: React.ReactNode) => (
    <div className="field">
      <label htmlFor={`ri-${k}`}>{l}</label>
      <input id={`ri-${k}`} className="inp num" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
    </div>
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !Number(f.cal)) return setErr("اكتبي الاسم والسعرات.");
    const num = (v: string) => (v ? Number(v) : null);
    const { data, error } = await supabase
      .from("restaurant_items")
      .insert({ restaurant_id: r.id, name: f.name.trim(), cal: Number(f.cal), p: num(f.p), c: num(f.c), f: num(f.fat), added_by: profileId })
      .select("*")
      .single();
    if (error || !data) return setErr(error?.code === "23505" ? "هالصنف موجود في القائمة." : "ما انحفظ. تأكدي إن الأرقام معقولة.");
    onDone(data as RestItem);
  }
  return (
    <form className="stack" onSubmit={save}>
      <b>{r.emoji || "🍽️"} صنف جديد في {r.name}</b>
      <p className="note">السعرات مكتوبة جنب الصنف في المنيو. البروتين والكارب والدهون اختيارية.</p>
      <div className="field">
        <label htmlFor="ri-name">اسم الصنف</label>
        <input id="ri-name" className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلًا: ساندويتش دجاج مشوي" autoFocus />
      </div>
      <div className="grid2" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {n("cal", "🔥 سعرات")}
        {n("p", <MacLabel k="p" />)}
        {n("c", <MacLabel k="c" />)}
        {n("fat", <MacLabel k="f" />)}
      </div>
      {err ? <p className="alert err">{err}</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-g" onClick={onBack}>رجوع</button>
        <button className="btn btn-p" style={{ flex: 1 }} type="submit">احفظيه</button>
      </div>
    </form>
  );
}

type Read = { restaurant: string | null; items: { name: string; cal: number }[] };

function MenuPhoto({ r, profileId, onDone, onBack }: { r: Restaurant; profileId: string; onDone: (added: RestItem[]) => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<{ name: string; cal: string; on: boolean }[] | null>(null);

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await aiRead<Read>("menu", file);
    setBusy(false);
    if (error || !data) return setErr(error || "ما قدرنا نقرأ المنيو.");
    if (!data.items.length) return setErr("ما لقينا سعرات مكتوبة في الصورة. صوري المنيو قريب وواضح.");
    setRows(data.items.filter((i) => i.name && i.cal > 0 && i.cal < 5000).map((i) => ({ name: i.name.slice(0, 120), cal: String(Math.round(i.cal)), on: true })));
  }

  async function save() {
    const chosen = (rows || []).filter((x) => x.on && x.name.trim() && Number(x.cal) > 0);
    if (!chosen.length) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("restaurant_items")
      .upsert(chosen.map((x) => ({ restaurant_id: r.id, name: x.name.trim(), cal: Number(x.cal), added_by: profileId })), { onConflict: "restaurant_id,name", ignoreDuplicates: true })
      .select("*");
    setBusy(false);
    if (error) return setErr("ما انحفظت. جربي مرة ثانية.");
    onDone((data as RestItem[] | null) || []);
  }

  return (
    <div className="stack">
      <b>📸 منيو {r.name}</b>
      {!rows ? (
        <>
          <p className="small muted">صوري المنيو (اللوحة أو الورقة أو من تطبيق التوصيل) وحنا نقرأ الأصناف وسعراتها المكتوبة.</p>
          <label className="btn btn-p" style={{ cursor: busy ? "wait" : "pointer" }}>
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => read(e.target.files?.[0])} />
            <Camera size={18} />
            {busy ? "لحظة... نقرأ المنيو 🔍" : "صوري المنيو"}
          </label>
        </>
      ) : (
        <>
          <p className="small">🤖 هذي الأصناف اللي قريناها، راجعيها واحفظيها لكل المشتركين:</p>
          {rows.map((x, i) => (
            <div key={i} className="diary-row" style={{ opacity: x.on ? 1 : 0.45 }}>
              <input type="checkbox" checked={x.on} aria-label={`احفظي ${x.name}`} onChange={() => setRows(rows.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} style={{ width: 20, height: 20, accentColor: "var(--clay)", flex: "none" }} />
              <input className="inp" aria-label="اسم الصنف" value={x.name} onChange={(e) => setRows(rows.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} style={{ minHeight: 38, flex: 1, minWidth: 0 }} />
              <input className="inp num" inputMode="numeric" aria-label={`سعرات ${x.name}`} value={x.cal} onChange={(e) => setRows(rows.map((y, j) => (j === i ? { ...y, cal: e.target.value.replace(/\D/g, "") } : y)))} style={{ width: 70, minHeight: 38, flex: "none" }} />
            </div>
          ))}
          <button type="button" className="btn btn-p" disabled={busy} onClick={save}>{busy ? "لحظة..." : "احفظيها"}</button>
        </>
      )}
      {err ? <p className="alert err">{err}</p> : null}
      <button type="button" className="btn btn-g" onClick={onBack}>رجوع</button>
    </div>
  );
}
