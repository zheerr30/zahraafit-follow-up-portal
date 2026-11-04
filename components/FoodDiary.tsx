"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { useToast } from "@/components/ui";
import { SLOTS, SLOT_EMOJI, defaultSlot, fromBase, fromCustom, scaled, search, type BaseFood, type CustomFood, type FoodEntry, type Pickable, type Slot } from "@/lib/foods";
import { todayKey, type Meal } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

type Target = { cal: number; p: number; c: number; f: number };
type Sheet =
  | { mode: "search"; slot: Slot }
  | { mode: "amount"; slot: Slot; food: Pickable }
  | { mode: "new"; slot: Slot; name: string };

let baseCache: BaseFood[] | null = null;
async function loadBase(): Promise<BaseFood[]> {
  if (baseCache) return baseCache;
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch("/api/foods", { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` } });
  if (!res.ok) return [];
  baseCache = (await res.json()) as BaseFood[];
  return baseCache;
}

const shiftDay = (d: string, n: number) => {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const dayLabel = (d: string) => {
  const t = todayKey();
  if (d === t) return "اليوم";
  if (d === shiftDay(t, -1)) return "أمس";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00"));
};
const slotOf = (label: string): Slot => (/فطور/.test(label) ? "فطور" : /غداء/.test(label) ? "غداء" : /عشاء/.test(label) ? "عشاء" : "سناك");
const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * Food diary: everything she ate on a day, against her target.
 * Ticked plan meals count automatically; anything else she searches and adds.
 */
export function FoodDiary({
  clientId,
  profileId,
  planTarget,
  planMeal
}: {
  clientId: string;
  profileId: string;
  planTarget: Target | null;
  /** Turns a ticked key from daily_logs ("0-2", "x-snacks-1") into the meal she ate. */
  planMeal: ((key: string) => Meal | null) | null;
}) {
  const toast = useToast();
  const [date, setDate] = useState(todayKey());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [ticked, setTicked] = useState<{ key: string; meal: Meal }[]>([]);
  const [target, setTarget] = useState<Target | null>(planTarget);
  const [foods, setFoods] = useState<Pickable[]>([]);
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [base, { data: mine }, { data: rec }, t] = await Promise.all([
        loadBase(),
        supabase.from("foods").select("*").order("name"),
        supabase.from("food_entries").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(80),
        planTarget ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal, p, c, f").eq("client_id", clientId).maybeSingle()
      ]);
      setFoods([...((mine as CustomFood[] | null) || []).map(fromCustom), ...base.map(fromBase)]);
      const seen = new Set<string>();
      setRecent(((rec as FoodEntry[] | null) || []).filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true))).slice(0, 12));
      if (!planTarget && t.data) setTarget(t.data as Target);
    })();
  }, [clientId, planTarget]);

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: d }] = await Promise.all([
        supabase.from("food_entries").select("*").eq("client_id", clientId).eq("log_date", date).order("created_at"),
        supabase.from("daily_logs").select("meals").eq("client_id", clientId).eq("log_date", date).maybeSingle()
      ]);
      setEntries((e as FoodEntry[] | null) || []);
      const m = ((d?.meals || {}) as Record<string, unknown>);
      setTicked(
        planMeal
          ? Object.keys(m)
              .filter((k) => m[k] === true && (/^\d+-\d+$/.test(k) || k.startsWith("x-")))
              .map((k) => ({ key: k, meal: planMeal(k) }))
              .filter((x): x is { key: string; meal: Meal } => Boolean(x.meal))
          : []
      );
      setLoaded(true);
    })();
  }, [clientId, date, planMeal]);

  const totals = useMemo(() => {
    const t = { cal: 0, p: 0, c: 0, f: 0 };
    ticked.forEach(({ meal }) => {
      t.cal += meal.cal; t.p += meal.p; t.c += meal.c; t.f += meal.f;
    });
    entries.forEach((e) => {
      t.cal += Number(e.cal); t.p += Number(e.p); t.c += Number(e.c); t.f += Number(e.f);
    });
    return t;
  }, [ticked, entries]);

  async function add(slot: Slot, row: Omit<FoodEntry, "id" | "client_id" | "log_date" | "slot" | "created_at">) {
    const { data, error } = await supabase
      .from("food_entries")
      .insert({ client_id: clientId, log_date: date, slot, ...row })
      .select("*")
      .single();
    if (error || !data) return toast.show("ما انحفظ. تأكدي من الاتصال.");
    setEntries((cur) => [...cur, data as FoodEntry]);
    setRecent((cur) => [data as FoodEntry, ...cur.filter((x) => x.name !== row.name)].slice(0, 12));
    setSheet(null);
    setQ("");
    toast.show(`انضاف ${row.name} ✅`);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("food_entries").delete().eq("id", id);
    if (error) return toast.show("ما انحذف. تأكدي من الاتصال.");
    setEntries((cur) => cur.filter((x) => x.id !== id));
  }

  const left = target ? Math.round(target.cal - totals.cal) : null;
  const results = sheet?.mode === "search" ? search(foods, q) : [];
  const today = todayKey();

  return (
    <>
      <div className="row between" style={{ alignItems: "center" }}>
        <button type="button" className="icon-btn" aria-label="اليوم اللي قبل" onClick={() => setDate(shiftDay(date, -1))}>
          <ChevronRight />
        </button>
        <b style={{ color: "var(--navy)" }}>{dayLabel(date)}</b>
        <button type="button" className="icon-btn" aria-label="اليوم اللي بعد" disabled={date >= today} style={{ opacity: date >= today ? 0.3 : 1 }} onClick={() => setDate(shiftDay(date, 1))}>
          <ChevronLeft />
        </button>
      </div>

      <section className="card stack" style={{ gap: 12 }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <span className="label">🔥 أكلتي</span>
            <b className="num" style={{ fontSize: 32, lineHeight: 1.1, color: "var(--navy)", display: "block" }}>{Math.round(totals.cal)}</b>
          </div>
          {target ? (
            <div style={{ textAlign: "end" }}>
              <span className="label">{left! >= 0 ? "باقي لك" : "زدتي"}</span>
              <b className="num" style={{ fontSize: 24, color: left! >= 0 ? "var(--green)" : "var(--clay-ink)", display: "block" }}>{Math.abs(left!)}</b>
              <span className="note">من {target.cal} سعرة</span>
            </div>
          ) : null}
        </div>
        {target ? (
          <span aria-hidden="true" style={{ display: "block", height: 8, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
            <i style={{ display: "block", height: "100%", width: `${Math.min(100, (totals.cal / target.cal) * 100)}%`, background: left! >= 0 ? "var(--clay)" : "var(--clay-ink)" }} />
          </span>
        ) : null}
        <div className="grid3">
          {([["💪 بروتين", totals.p, target?.p, "var(--protein)"], ["🌾 كارب", totals.c, target?.c, "var(--carb)"], ["🫒 دهون", totals.f, target?.f, "var(--fat)"]] as [string, number, number | undefined, string][]).map(([l, v, t, c]) => (
            <div key={l} className="mtile" style={{ "--c": c, textAlign: "start" } as React.CSSProperties}>
              <span>{l}</span>
              <b>{Math.round(v)}g</b>
              {t ? <span>من {t}g</span> : null}
            </div>
          ))}
        </div>
        {!target ? (
          <Link href="/app/guide?tab=calc" className="tip-card">
            <span className="em" aria-hidden="true">🧮</span>
            <span>حطي هدفك اليومي من <b>الحاسبة</b> عشان نقولك كم باقي لك.</span>
          </Link>
        ) : null}
      </section>

      {SLOTS.map((slot) => {
        const plan = ticked.filter((x) => slotOf(x.meal.slot) === slot);
        const mine = entries.filter((e) => e.slot === slot);
        const cal = plan.reduce((a, x) => a + x.meal.cal, 0) + mine.reduce((a, x) => a + Number(x.cal), 0);
        return (
          <section key={slot} className="card stack" style={{ gap: 0, padding: "12px 16px" }}>
            <div className="row between" style={{ paddingBottom: 6 }}>
              <b>{SLOT_EMOJI[slot]} {slot}</b>
              <span className="small muted num">{Math.round(cal)} سعرة</span>
            </div>
            {plan.map(({ key, meal }) => (
              <div key={key} className="diary-row">
                <span style={{ minWidth: 0 }}>
                  {meal.name}
                  <span className="note" style={{ display: "block" }}>✅ من خطتك · 💪 {Math.round(meal.p)} · 🌾 {Math.round(meal.c)} · 🫒 {Math.round(meal.f)}</span>
                </span>
                <b className="num">{meal.cal}</b>
              </div>
            ))}
            {mine.map((e) => (
              <div key={e.id} className="diary-row">
                <span style={{ minWidth: 0 }}>
                  {e.name}
                  <span className="note" style={{ display: "block" }}>{fmt(Number(e.amount))} {e.unit} · 💪 {fmt(Number(e.p))} · 🌾 {fmt(Number(e.c))} · 🫒 {fmt(Number(e.f))}</span>
                </span>
                <b className="num">{Math.round(Number(e.cal))}</b>
                <button type="button" className="icon-btn" aria-label={`احذفي ${e.name}`} onClick={() => remove(e.id)}>
                  <X size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="link" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => { setQ(""); setSheet({ mode: "search", slot }); }}>
              <Plus size={16} />
              أضيفي أكل
            </button>
          </section>
        );
      })}
      {loaded && !entries.length && !ticked.length ? (
        <p className="note" style={{ textAlign: "center" }}>
          {planMeal ? "علّمي على وجبات خطتك من «وجباتي» وتنحسب هنا، وأي شي ثاني أضيفيه بنفسك." : "ابدئي بإضافة أول شي أكلتيه 👆"}
        </p>
      ) : null}

      {sheet ? (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="أضيفي أكل" style={{ maxHeight: "88vh", overflowY: "auto" }}>
            <div className="row between">
              <h2 style={{ fontSize: 18 }}>{SLOT_EMOJI[sheet.slot]} {sheet.mode === "new" ? "صنف جديد" : `أضيفي لـ${sheet.slot}`}</h2>
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setSheet(null)}>
                <X />
              </button>
            </div>

            {sheet.mode === "search" ? (
              <>
                <div className="unit">
                  <label htmlFor="food-q" className="sr-only">ابحثي</label>
                  <input id="food-q" className="inp" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي: دجاج، رز، تمر، شوفان..." />
                  <span><Search size={16} /></span>
                </div>
                {q.trim() ? (
                  <div className="opts">
                    {results.map((f) => (
                      <button key={f.key} type="button" className="opt" onClick={() => setSheet({ mode: "amount", slot: sheet.slot, food: f })}>
                        <span style={{ minWidth: 0 }}>
                          <span className="opt-t">{f.name}</span>
                          <span className="opt-s">{f.cal} سعرة {f.basis === "100g" ? "لكل ١٠٠ جم" : `لكل ${f.units[0].label}`}{f.hint ? ` · ${f.hint}` : ""}</span>
                        </span>
                      </button>
                    ))}
                    <button type="button" className="btn btn-g" onClick={() => setSheet({ mode: "new", slot: sheet.slot, name: q.trim() })}>
                      <Plus size={16} />
                      {results.length ? "ما لقيتيه؟ أضيفيه بنفسك" : `ما لقينا «${q.trim()}». أضيفيه بنفسك`}
                    </button>
                  </div>
                ) : recent.length ? (
                  <>
                    <span className="label">⏱️ أكلتيها قبل (اضغطي وتنضاف بنفس الكمية)</span>
                    <div className="opts">
                      {recent.map((e) => (
                        <button key={e.id} type="button" className="opt" onClick={() => add(sheet.slot, { name: e.name, amount: e.amount, unit: e.unit, cal: e.cal, p: e.p, c: e.c, f: e.f })}>
                          <span style={{ minWidth: 0 }}>
                            <span className="opt-t">{e.name}</span>
                            <span className="opt-s">{fmt(Number(e.amount))} {e.unit} · {Math.round(Number(e.cal))} سعرة</span>
                          </span>
                          <Plus size={18} color="var(--clay)" style={{ flexShrink: 0, marginInlineStart: "auto" }} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="note">اكتبي اسم الأكل. الأصناف نفس اللي تستخدمها المدربة في خطتك.</p>
                )}
              </>
            ) : sheet.mode === "amount" ? (
              <AmountPicker food={sheet.food} onAdd={(amount, unit) => {
                const v = scaled(sheet.food, amount, unit);
                add(sheet.slot, { name: sheet.food.name, amount, unit: unit.label, ...v });
              }} onBack={() => setSheet({ mode: "search", slot: sheet.slot })} />
            ) : (
              <NewFood initialName={sheet.name} profileId={profileId} onSaved={(f) => {
                setFoods((cur) => [f, ...cur]);
                setSheet({ mode: "amount", slot: sheet.slot, food: f });
              }} />
            )}
          </div>
        </div>
      ) : null}
      {toast.node}
    </>
  );
}

function AmountPicker({ food, onAdd, onBack }: { food: Pickable; onAdd: (amount: number, unit: { label: string; g: number }) => void; onBack: () => void }) {
  const [unitIdx, setUnitIdx] = useState(0);
  const unit = food.units[unitIdx];
  const [amount, setAmount] = useState(food.basis === "100g" && unit.label === "جرام" ? "100" : "1");
  const n = Number(amount) || 0;
  const v = scaled(food, n, unit);
  return (
    <div className="stack">
      <div>
        <b style={{ fontSize: 17 }}>{food.name}</b>
        <p className="note">{food.hint}</p>
      </div>
      <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="amt">الكمية</label>
          <input id="amt" className="inp num" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        {food.units.length > 1 ? (
          <div className="seg-tabs" role="group" aria-label="الوحدة" style={{ flex: 1 }}>
            {food.units.map((u, i) => (
              <button key={u.label} type="button" aria-selected={i === unitIdx} onClick={() => { setUnitIdx(i); setAmount(u.label === "جرام" ? "100" : "1"); }}>{u.label}</button>
            ))}
          </div>
        ) : (
          <span className="chip" style={{ marginBottom: 10 }}>{unit.label}</span>
        )}
      </div>
      {unit.label !== "جرام" && food.basis === "100g" ? <p className="note">{unit.label} ≈ {unit.g} جم</p> : null}
      <div className="grid2" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {([["🔥", v.cal, "سعرة"], ["💪", v.p, "بروتين"], ["🌾", v.c, "كارب"], ["🫒", v.f, "دهون"]] as [string, number, string][]).map(([em, val, l]) => (
          <div key={l} className="stat" style={{ padding: 10 }}>
            <span>{em} {l}</span>
            <b style={{ fontSize: 18 }}>{fmt(val)}</b>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-g" onClick={onBack}>رجوع</button>
        <button type="button" className="btn btn-p" style={{ flex: 1 }} disabled={n <= 0} onClick={() => onAdd(n, unit)}>أضيفي</button>
      </div>
    </div>
  );
}

function NewFood({ initialName, profileId, onSaved }: { initialName: string; profileId: string; onSaved: (f: Pickable) => void }) {
  const [f, setF] = useState({ name: initialName, basis: "serving" as "serving" | "100g", label: "حصة", cal: "", p: "", c: "", f: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (k: "cal" | "p" | "c" | "f", label: string) => (
    <div className="field">
      <label htmlFor={`nf-${k}`}>{label}</label>
      <input id={`nf-${k}`} className="inp num" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") })} placeholder={k === "cal" ? "250" : "0"} />
    </div>
  );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.name.trim() || !Number(f.cal)) return setErr("اكتبي الاسم والسعرات على الأقل.");
        setBusy(true);
        const { data, error } = await supabase
          .from("foods")
          .insert({ owner_id: profileId, name: f.name.trim(), basis: f.basis, serving_label: f.basis === "serving" ? f.label.trim() || "حصة" : null, cal: Number(f.cal), p: Number(f.p) || 0, c: Number(f.c) || 0, f: Number(f.f) || 0 })
          .select("*")
          .single();
        setBusy(false);
        if (error || !data) return setErr("ما انحفظ. تأكدي إن الأرقام معقولة وجربي مرة ثانية.");
        onSaved(fromCustom(data as CustomFood));
      }}
    >
      <p className="note">تلقين الأرقام على ملصق المنتج أو موقع المطعم. يتحفظ في «أكلاتي» وتلقينه المرة الجاية.</p>
      <div className="field">
        <label htmlFor="nf-name">الاسم</label>
        <input id="nf-name" className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلًا: ساندويتش حلومي من ..." />
      </div>
      <div className="seg-tabs" role="group" aria-label="الأرقام لكل">
        <button type="button" aria-selected={f.basis === "serving"} onClick={() => setF({ ...f, basis: "serving" })}>لكل حصة / حبة</button>
        <button type="button" aria-selected={f.basis === "100g"} onClick={() => setF({ ...f, basis: "100g" })}>لكل ١٠٠ جم</button>
      </div>
      {f.basis === "serving" ? (
        <div className="field">
          <label htmlFor="nf-label">اسم الحصة</label>
          <input id="nf-label" className="inp" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="حصة، حبة، علبة، ساندويتش" />
        </div>
      ) : null}
      <div className="grid2">
        {num("cal", "🔥 السعرات")}
        {num("p", "💪 بروتين (جم)")}
        {num("c", "🌾 كارب (جم)")}
        {num("f", "🫒 دهون (جم)")}
      </div>
      {err ? <p className="alert err">{err}</p> : null}
      <button className="btn btn-p" type="submit" disabled={busy}>{busy ? "لحظة..." : "احفظي وكملي"}</button>
    </form>
  );
}
