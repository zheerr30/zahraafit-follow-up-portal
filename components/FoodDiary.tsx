"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import { track } from "@/components/AppStatus";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { useToast } from "@/components/ui";
import { SLOTS, SLOT_EMOJI, defaultSlot, fromBarcode, fromBase, fromCustom, scaled, search, type BarcodeProduct, type BaseFood, type CustomFood, type FoodEntry, type Pickable, type Slot } from "@/lib/foods";
import { aiRead, lookupBarcode } from "@/lib/food-scan";
import { BarcodeScanner, MealPhoto } from "@/components/FoodScan";
import { Restaurants } from "@/components/Restaurants";
import { CalorieCard } from "@/components/CalorieCard";
import { RAMADAN_EMOJI, RAMADAN_SLOT } from "@/lib/ramadan";
import { loadBase } from "@/lib/base-foods";
import { STORE_URL } from "@/lib/account";
import { SuggestedSnacks } from "@/components/SuggestedSnacks";
import { generalSnacks, type Snack } from "@/lib/snacks";
import { todayKey, type Meal } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

type Target = { cal: number; p: number; c: number; f: number };
type Sheet =
  | { mode: "search"; slot: Slot }
  | { mode: "amount"; slot: Slot; food: Pickable }
  | { mode: "new"; slot: Slot; name: string; barcode?: string }
  | { mode: "barcode"; slot: Slot }
  | { mode: "photo"; slot: Slot }
  | { mode: "saveMeal"; slot: Slot }
  | { mode: "rest"; slot: Slot };
type EntryRow = Omit<FoodEntry, "id" | "client_id" | "log_date" | "slot" | "created_at">;
type Saved = { id: string; kind: "item" | "meal"; name: string; data: { food?: Pickable; items?: EntryRow[] } };

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
const slotOf = (label: string): Slot => (/فطور/.test(label) ? "فطور" : /غداء|بينية/.test(label) ? "غداء" : /عشاء|سحور/.test(label) ? "عشاء" : "سناك");

/** Meal to add to by the time of day; in Ramadan: فطور from Maghrib, then وجبة بينية, then سحور. */
function slotNow(ramadan: boolean): Slot {
  if (!ramadan) return defaultSlot();
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
  if (h >= 17 && h < 21) return "فطور";
  if (h >= 21 || h < 1) return "غداء";
  if (h < 5) return "عشاء";
  return "فطور";
}
/** Line under the card when there is no plan to follow (or for another day). */
function genericLine(eaten: number, target: Target | null, isToday: boolean): ReactNode {
  const e = Math.round(eaten);
  if (!isToday) return e ? <>سجلتي هاليوم <b>{e}</b> سعرة{target ? ` من ${target.cal}` : ""}.</> : <>ما سجلتي أكل هاليوم.</>;
  if (!e) return <>👆 ابدئي بتسجيل أول شي أكلتيه اليوم.</>;
  if (!target) return <>سجلتي <b>{e}</b> سعرة اليوم. حطي هدفك من الحاسبة عشان نقولك كم باقي.</>;
  const left = Math.round(target.cal - eaten);
  if (left < 0) return <>📊 زدتي <b>{-left}</b> سعرة عن هدفك اليوم. عادي يصير، بكرا يوم جديد 💪</>;
  return <>👍 باقي لك <b>{left}</b> سعرة اليوم.</>;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * Food diary: everything she ate on a day, against her target.
 * Ticked plan meals count automatically; anything else she searches and adds.
 */
export function FoodDiary({
  clientId,
  profileId,
  planTarget,
  planMeal,
  smartLine,
  coachSnacks,
  focusSnacks,
  ramadan = false
}: {
  clientId: string;
  profileId: string;
  planTarget: Target | null;
  /** Turns a ticked key from daily_logs ("0-2", "x-snacks-1") into the meal she ate. */
  planMeal: ((key: string) => Meal | null) | null;
  /** Today's line under the card from the plan (next meal, open calories...), given calories eaten. */
  smartLine?: (eatenCal: number) => ReactNode;
  /** The snacks and salads the coach put in her plan (shown as «سناكات مقترحة»). */
  coachSnacks?: Meal[];
  /** Scroll to «سناكات مقترحة» when opened from the line under the card. */
  focusSnacks?: boolean;
  /** Ramadan mode: meals are فطور / وجبة بينية / سحور. */
  ramadan?: boolean;
}) {
  const lbl = (sl: Slot) => (ramadan ? RAMADAN_SLOT[sl] : sl);
  const emo = (sl: Slot) => (ramadan ? RAMADAN_EMOJI[sl] : SLOT_EMOJI[sl]);
  const toast = useToast();
  const [date, setDate] = useState(todayKey());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [prevEntries, setPrevEntries] = useState<FoodEntry[]>([]);
  const [ticked, setTicked] = useState<{ key: string; meal: Meal }[]>([]);
  const [target, setTarget] = useState<Target | null>(planTarget);
  const [foods, setFoods] = useState<Pickable[]>([]);
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [mealName, setMealName] = useState("");
  const [photosLeft, setPhotosLeft] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [base, { data: mine }, { data: rec }, t, { data: bc }] = await Promise.all([
        loadBase(),
        supabase.from("foods").select("*").order("name"),
        supabase.from("food_entries").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(80),
        planTarget ? Promise.resolve({ data: null }) : supabase.from("food_targets").select("cal, p, c, f").eq("client_id", clientId).maybeSingle(),
        supabase.from("barcode_products").select("*").order("created_at", { ascending: false }).limit(500)
      ]);
      setFoods([...((mine as CustomFood[] | null) || []).map(fromCustom), ...((bc as BarcodeProduct[] | null) || []).map(fromBarcode), ...base.map(fromBase)]);
      const seen = new Set<string>();
      setRecent(((rec as FoodEntry[] | null) || []).filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true))).slice(0, 12));
      supabase.from("saved_foods").select("id, kind, name, data").order("created_at", { ascending: false }).then(({ data }) => setSaved((data as Saved[] | null) || []));
      if (!planTarget && t.data) setTarget(t.data as Target);
    })();
  }, [clientId, planTarget]);

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: d }, { data: pe }] = await Promise.all([
        supabase.from("food_entries").select("*").eq("client_id", clientId).eq("log_date", date).order("created_at"),
        supabase.from("daily_logs").select("meals").eq("client_id", clientId).eq("log_date", date).maybeSingle(),
        supabase.from("food_entries").select("*").eq("client_id", clientId).eq("log_date", shiftDay(date, -1)).order("created_at")
      ]);
      setEntries((e as FoodEntry[] | null) || []);
      setPrevEntries((pe as FoodEntry[] | null) || []);
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

  /** Several items at once (from a meal photo). */
  async function addMany(slot: Slot, rows: Omit<FoodEntry, "id" | "client_id" | "log_date" | "slot" | "created_at">[]) {
    const { data, error } = await supabase.from("food_entries").insert(rows.map((r) => ({ client_id: clientId, log_date: date, slot, ...r }))).select("*");
    if (error || !data) return toast.show("ما انحفظ. تأكدي من الاتصال.");
    setEntries((cur) => [...cur, ...(data as FoodEntry[])]);
    setSheet(null);
    toast.show(`انضافت ${data.length} أصناف ✅`);
  }

  async function onBarcode(slot: Slot, code: string) {
    toast.show("لحظة، ندور على المنتج...");
    const pr = await lookupBarcode(code, profileId);
    if (pr) {
      const f = fromBarcode(pr);
      setFoods((cur) => [f, ...cur.filter((x) => x.key !== f.key)]);
      setSheet({ mode: "amount", slot, food: f });
    } else {
      setSheet({ mode: "new", slot, name: "", barcode: code });
      toast.show("ما لقينا هالمنتج. صوري جدول القيم الغذائية وحنا نقرأه 📸");
    }
  }

  useEffect(() => {
    if (!focusSnacks || !loaded) return;
    setTimeout(() => document.getElementById("snacks")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [focusSnacks, loaded]);

  // Photos left today, refreshed whenever the add-food sheet closes.
  useEffect(() => {
    if (sheet) return;
    supabase.rpc("ai_left", { p_kind: "meal" }).then(({ data, error }) => { if (!error && typeof data === "number") setPhotosLeft(data); });
  }, [sheet]);

  const favOf = (f: Pickable) => saved.find((x) => x.kind === "item" && x.data.food?.key === f.key);

  /** A logged item as a food she can add again (one serving = what she logged). */
  const entryFood = (e: FoodEntry): Pickable => ({
    key: `e:${e.name}|${Number(e.amount)}|${e.unit}`,
    name: e.name,
    src: "mine",
    basis: "serving",
    cal: Number(e.cal), p: Number(e.p), c: Number(e.c), f: Number(e.f),
    hint: `${fmt(Number(e.amount))} ${e.unit}`,
    units: [{ label: `حصة (${fmt(Number(e.amount))} ${e.unit})`, g: 1 }]
  });

  async function toggleFav(f: Pickable) {
    const cur = favOf(f);
    if (cur) {
      await supabase.from("saved_foods").delete().eq("id", cur.id);
      setSaved((l) => l.filter((x) => x.id !== cur.id));
      return toast.show("انشال من مفضلاتك");
    }
    const { data, error } = await supabase.from("saved_foods").insert({ kind: "item", name: f.name, data: { food: f } }).select("id, kind, name, data").single();
    if (error || !data) return toast.show("ما انحفظ. تأكدي من الاتصال.");
    setSaved((l) => [data as Saved, ...l]);
    toast.show("⭐ انضاف لمفضلاتك");
  }

  /** Everything in one meal of this day, to save as «وجبة محفوظة». */
  const slotItems = (slot: Slot): EntryRow[] => [
    ...ticked.filter((x) => slotOf(x.meal.slot) === slot).map((x) => ({ name: x.meal.name, amount: 1, unit: "وجبة", cal: x.meal.cal, p: x.meal.p, c: x.meal.c, f: x.meal.f })),
    ...entries.filter((e) => e.slot === slot).map((e) => ({ name: e.name, amount: Number(e.amount), unit: e.unit, cal: Number(e.cal), p: Number(e.p), c: Number(e.c), f: Number(e.f) }))
  ];

  async function saveMeal(slot: Slot) {
    const items = slotItems(slot);
    const name = mealName.trim() || `${lbl(slot)} ${dayLabel(date)}`;
    if (!items.length) return;
    const { data, error } = await supabase.from("saved_foods").insert({ kind: "meal", name: name.slice(0, 120), data: { items } }).select("id, kind, name, data").single();
    if (error || !data) return toast.show("ما انحفظت. تأكدي من الاتصال.");
    setSaved((l) => [data as Saved, ...l]);
    setSheet(null);
    setMealName("");
    toast.show("🍱 انحفظت في وجباتك المحفوظة");
  }

  async function removeSaved(id: string) {
    await supabase.from("saved_foods").delete().eq("id", id);
    setSaved((l) => l.filter((x) => x.id !== id));
  }

  /** Copies yesterday's items of one meal to this day. */
  async function copyPrev(slot: Slot) {
    const rows = prevEntries.filter((x) => x.slot === slot).map((x) => ({ client_id: clientId, log_date: date, slot, name: x.name, amount: x.amount, unit: x.unit, cal: x.cal, p: x.p, c: x.c, f: x.f }));
    if (!rows.length) return;
    const { data, error } = await supabase.from("food_entries").insert(rows).select("*");
    if (error || !data) return toast.show("ما انحفظ. تأكدي من الاتصال.");
    setEntries((cur) => [...cur, ...(data as FoodEntry[])]);
    toast.show(`انضاف ${lbl(slot)} نفس أمس ✅`);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("food_entries").delete().eq("id", id);
    if (error) return toast.show("ما انحذف. تأكدي من الاتصال.");
    setEntries((cur) => cur.filter((x) => x.id !== id));
  }

  const left = target ? Math.round(target.cal - totals.cal) : null;
  const snackList: Snack[] = coachSnacks && coachSnacks.length
    ? coachSnacks.map((m) => ({ name: m.name, detail: m.ingredients.slice(0, 3).map((i) => i.n).join("، "), cal: m.cal, p: m.p, c: m.c, f: m.f }))
    : generalSnacks(foods);
  // Favorites first, including foods starred from what she logged.
  const favFoods = saved.filter((x) => x.kind === "item" && x.data.food).map((x) => x.data.food!);
  const results = sheet?.mode === "search"
    ? search([...favFoods.filter((f) => !foods.some((x) => x.key === f.key)), ...foods], q).sort((a, b) => Number(Boolean(favOf(b))) - Number(Boolean(favOf(a))))
    : [];
  const today = todayKey();

  return (
    <>
      <CalorieCard
        totals={totals}
        target={target}
        header={
          <>
            <div style={{ minWidth: 0 }}>
              <h2>🔥 حاسبة السعرات</h2>
              <p>سجلي اللي تاكلينه ونحسب لك السعرات والبروتين والكارب والدهون تلقائي.</p>
            </div>
            <div className="cal-day" role="group" aria-label="اليوم">
              <button type="button" aria-label="اليوم اللي قبل" onClick={() => setDate(shiftDay(date, -1))}><ChevronRight size={18} /></button>
              <b>{dayLabel(date)}</b>
              <button type="button" aria-label="اليوم اللي بعد" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><ChevronLeft size={18} /></button>
            </div>
          </>
        }
        line={
          date === today && smartLine
            ? smartLine(totals.cal)
            : genericLine(totals.cal, target, date === today)
        }
      />

      <SuggestedSnacks
        snacks={snackList}
        fromCoach={Boolean(coachSnacks && coachSnacks.length)}
        left={target ? Math.round(target.cal - totals.cal) : null}
        onAdd={async (sn) => { await add("سناك", { name: sn.name, amount: 1, unit: "حصة", cal: sn.cal, p: sn.p, c: sn.c, f: sn.f }); return true; }}
      />

      <div className="quick-row">
        <button type="button" onClick={() => { setQ(""); setSheet({ mode: "search", slot: slotNow(ramadan) }); }}><span aria-hidden="true">🔍</span>ابحثي</button>
        <button type="button" onClick={() => setSheet({ mode: "barcode", slot: slotNow(ramadan) })}><span aria-hidden="true">📷</span>باركود</button>
        <button type="button" onClick={() => { track("food:photo"); setSheet({ mode: "photo", slot: slotNow(ramadan) }); }}><span aria-hidden="true">🤖</span>صوري صحنك{photosLeft !== null && photosLeft >= 0 ? <span className="cal-badge">{photosLeft > 0 ? `باقي ${photosLeft} صور` : "للمشتركين"}</span> : null}</button>
        <button type="button" onClick={() => setSheet({ mode: "rest", slot: slotNow(ramadan) })}><span aria-hidden="true">🍔</span>مطاعم</button>
      </div>

      {SLOTS.map((slot) => {
        const plan = ticked.filter((x) => slotOf(x.meal.slot) === slot);
        const mine = entries.filter((e) => e.slot === slot);
        const cal = plan.reduce((a, x) => a + x.meal.cal, 0) + mine.reduce((a, x) => a + Number(x.cal), 0);
        return (
          <section key={slot} className="card stack" style={{ gap: 0, padding: "12px 16px" }}>
            <div className="row between" style={{ paddingBottom: 6 }}>
              <b>{emo(slot)} {lbl(slot)}</b>
              <span className="row" style={{ gap: 8 }}>
                {plan.length + mine.length > 0 ? (
                  <button type="button" className="link small" style={{ minHeight: 0 }} onClick={() => { setMealName(""); setSheet({ mode: "saveMeal", slot }); }}>⭐ احفظيها</button>
                ) : null}
                <span className="small muted num">{Math.round(cal)} سعرة</span>
              </span>
            </div>
            {!mine.length && prevEntries.some((x) => x.slot === slot) ? (
              <button type="button" className="copy-prev" onClick={() => copyPrev(slot)}>
                ↺ نفس {lbl(slot)} أمس ({prevEntries.filter((x) => x.slot === slot).map((x) => x.name).join("، ")})
              </button>
            ) : null}
            {plan.map(({ key, meal }) => (
              <div key={key} className="diary-row">
                <span style={{ minWidth: 0 }}>
                  {meal.name}
                  <span className="note" style={{ display: "block" }}>✅ من خطتك · <MacLine p={Math.round(meal.p)} c={Math.round(meal.c)} f={Math.round(meal.f)} /></span>
                </span>
                <b className="num">{meal.cal}</b>
              </div>
            ))}
            {mine.map((e) => (
              <div key={e.id} className="diary-row">
                <span style={{ minWidth: 0 }}>
                  {e.name}
                  <span className="note" style={{ display: "block" }}>{fmt(Number(e.amount))} {e.unit} · <MacLine p={fmt(Number(e.p))} c={fmt(Number(e.c))} f={fmt(Number(e.f))} /></span>
                </span>
                <b className="num">{Math.round(Number(e.cal))}</b>
                <button type="button" className="icon-btn fav-mini" aria-pressed={Boolean(favOf(entryFood(e)))} aria-label={favOf(entryFood(e)) ? `شيلي ${e.name} من المفضلة` : `أضيفي ${e.name} للمفضلة`} onClick={() => toggleFav(entryFood(e))}>
                  {favOf(entryFood(e)) ? "⭐" : "☆"}
                </button>
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
          {planMeal ? "علمي على وجبات خطتك من «وجباتي» وتنحسب هنا، وأي شي ثاني أضيفيه بنفسك." : "ابدئي بإضافة أول شي أكلتيه 👆"}
        </p>
      ) : null}

      {sheet ? (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="أضيفي أكل" style={{ maxHeight: "88vh", overflowY: "auto" }}>
            <div className="row between">
              <h2 style={{ fontSize: 18 }}>{emo(sheet.slot)} {sheet.mode === "new" ? (sheet.barcode ? "منتج جديد" : "صنف جديد") : sheet.mode === "barcode" ? "امسحي الباركود" : sheet.mode === "photo" ? "صوري وجبتك" : sheet.mode === "saveMeal" ? `احفظي ${lbl(sheet.slot)} كوجبة` : sheet.mode === "rest" ? `مطاعم · ${lbl(sheet.slot)}` : `أضيفي لـ${lbl(sheet.slot)}`}</h2>
              <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => setSheet(null)}>
                <X />
              </button>
            </div>

            {sheet.mode === "search" ? (
              <>
                <div className="scan-btns">
                  <button type="button" onClick={() => setSheet({ mode: "barcode", slot: sheet.slot })}><span aria-hidden="true">📷</span>باركود</button>
                  <button type="button" onClick={() => setSheet({ mode: "photo", slot: sheet.slot })}><span aria-hidden="true">🤖</span>صوري وجبتك</button>
                  <button type="button" onClick={() => setSheet({ mode: "rest", slot: sheet.slot })}><span aria-hidden="true">🍔</span>مطاعم</button>
                  <button type="button" onClick={() => setSheet({ mode: "new", slot: sheet.slot, name: q.trim() })}><span aria-hidden="true">✍️</span>صنف جديد</button>
                </div>
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
                          <span className="opt-t">{favOf(f) ? "⭐ " : ""}{f.name}</span>
                          <span className="opt-s">{f.cal} سعرة {f.basis === "100g" ? "لكل ١٠٠ جم" : `لكل ${f.units[0].label}`}{f.hint ? ` · ${f.hint}` : ""}</span>
                        </span>
                      </button>
                    ))}
                    <button type="button" className="btn btn-g" onClick={() => setSheet({ mode: "new", slot: sheet.slot, name: q.trim() })}>
                      <Plus size={16} />
                      {results.length ? "ما لقيتيه؟ أضيفيه بنفسك" : `ما لقينا «${q.trim()}». أضيفيه بنفسك`}
                    </button>
                  </div>
                ) : saved.length || recent.length ? (
                  <>
                    {saved.some((x) => x.kind === "meal") ? (
                      <>
                        <span className="label">🍱 وجباتي المحفوظة (اضغطي وتنضاف كلها)</span>
                        <div className="opts">
                          {saved.filter((x) => x.kind === "meal").map((m) => {
                            const items = m.data.items || [];
                            return (
                              <div key={m.id} className="opt" style={{ padding: 0 }}>
                                <button type="button" style={{ flex: 1, minWidth: 0, textAlign: "start", padding: "12px 14px" }} onClick={() => addMany(sheet.slot, items)}>
                                  <span className="opt-t">{m.name}</span>
                                  <span className="opt-s">{items.map((i) => i.name).join("، ")} · {Math.round(items.reduce((a, i) => a + Number(i.cal), 0))} سعرة</span>
                                </button>
                                <button type="button" className="icon-btn" aria-label={`احذفي ${m.name}`} onClick={() => removeSaved(m.id)}><X size={15} /></button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                    {saved.some((x) => x.kind === "item") ? (
                      <>
                        <span className="label">⭐ مفضلاتي</span>
                        <div className="fav-chips">
                          {saved.filter((x) => x.kind === "item" && x.data.food).map((x) => (
                            <button key={x.id} type="button" onClick={() => setSheet({ mode: "amount", slot: sheet.slot, food: x.data.food! })}>{x.name}</button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {recent.length ? <span className="label">⏱️ أكلتيها قبل (اضغطي وتنضاف بنفس الكمية)</span> : null}
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
              <AmountPicker food={sheet.food} fav={Boolean(favOf(sheet.food))} onFav={() => toggleFav(sheet.food)} onAdd={(amount, unit) => {
                const v = scaled(sheet.food, amount, unit);
                add(sheet.slot, { name: sheet.food.name, amount, unit: unit.label, ...v });
              }} onBack={() => setSheet({ mode: "search", slot: sheet.slot })} />
            ) : sheet.mode === "rest" ? (
              <Restaurants profileId={profileId} onAdd={(row) => add(sheet.slot, row)} onBack={() => setSheet({ mode: "search", slot: sheet.slot })} />
            ) : sheet.mode === "saveMeal" ? (
              <div className="stack">
                <p className="small muted">تحفظينها وبعدين تضيفينها كلها بضغطة من «أضيفي أكل».</p>
                <div className="opts">
                  {slotItems(sheet.slot).map((i, n) => (
                    <div key={n} className="row between small" style={{ padding: "4px 0" }}>
                      <span>{i.name} <span className="note">{fmt(Number(i.amount))} {i.unit}</span></span>
                      <b className="num">{Math.round(Number(i.cal))}</b>
                    </div>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="meal-name">اسمها</label>
                  <input id="meal-name" className="inp" value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder={`مثلًا: ${({ فطور: "فطوري", غداء: "غدائي", عشاء: "عشائي", سناك: "سناكي" } as Record<Slot, string>)[sheet.slot]} المعتاد`} />
                </div>
                <button type="button" className="btn btn-p" onClick={() => saveMeal(sheet.slot)}>⭐ احفظيها</button>
              </div>
            ) : sheet.mode === "barcode" ? (
              <BarcodeScanner onCode={(code) => { track("food:barcode"); onBarcode(sheet.slot, code); }} onCancel={() => setSheet({ mode: "search", slot: sheet.slot })} />
            ) : sheet.mode === "photo" && photosLeft === 0 ? (
              <div className="offer">
                <span className="offer-em" aria-hidden="true">📸</span>
                <h2>خلصت صورك المجانية</h2>
                <p>مع الاشتراك تصورين صحنك بدون حد، وتحصلين خطة وجبات وتمارين من المدربة زهراء.</p>
                <a className="btn btn-p btn-block" href={STORE_URL} target="_blank" rel="noreferrer">اشتركي من المتجر</a>
                <button type="button" className="link" style={{ color: "#fff", alignSelf: "center" }} onClick={() => setSheet({ mode: "search", slot: sheet.slot })}>سجليه بالبحث بدالها</button>
              </div>
            ) : sheet.mode === "photo" ? (
              <MealPhoto onAdd={(rows) => addMany(sheet.slot, rows)} onCancel={() => setSheet({ mode: "search", slot: sheet.slot })} />
            ) : (
              <NewFood initialName={sheet.name} barcode={sheet.barcode} profileId={profileId} onSaved={(f) => {
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

function AmountPicker({ food, fav, onFav, onAdd, onBack }: { food: Pickable; fav: boolean; onFav: () => void; onAdd: (amount: number, unit: { label: string; g: number }) => void; onBack: () => void }) {
  const [unitIdx, setUnitIdx] = useState(0);
  const unit = food.units[unitIdx];
  const [amount, setAmount] = useState(food.basis === "100g" && unit.label === "جرام" ? "100" : "1");
  const n = Number(amount) || 0;
  const v = scaled(food, n, unit);
  return (
    <div className="stack">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 17 }}>{food.name}</b>
          <p className="note">{food.hint}</p>
        </div>
        <button type="button" className="fav-star" aria-pressed={fav} aria-label={fav ? "شيليه من المفضلة" : "أضيفيه للمفضلة"} onClick={onFav}>{fav ? "⭐" : "☆"}</button>
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
        {([["🔥", v.cal, "سعرة"], ["p", v.p, "بروتين"], ["c", v.c, "كارب"], ["f", v.f, "دهون"]] as [string, number, string][]).map(([em, val, l]) => (
          <div key={l} className="stat" style={{ padding: 10 }}>
            <span>{em === "🔥" ? <>🔥 {l}</> : <MacLabel k={em as "p" | "c" | "f"} />}</span>
            <b style={{ fontSize: 18, color: em === "🔥" ? undefined : `var(--${em === "p" ? "protein" : em === "c" ? "carb" : "fat"})` }}>{fmt(val)}</b>
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

type LabelRead = { readable: boolean; name: string | null; per100: Macro | null; perServing: Macro | null; serving_g: number | null; serving_label: string | null };
type Macro = { cal: number | null; p: number | null; c: number | null; f: number | null };

function NewFood({ initialName, barcode, profileId, onSaved }: { initialName: string; barcode?: string; profileId: string; onSaved: (f: Pickable) => void }) {
  const [f, setF] = useState({ name: initialName, basis: (barcode ? "100g" : "serving") as "serving" | "100g", label: "حصة", servingG: "", cal: "", p: "", c: "", f: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const num = (k: "cal" | "p" | "c" | "f", label: React.ReactNode) => (
    <div className="field">
      <label htmlFor={`nf-${k}`}>{label}</label>
      <input id={`nf-${k}`} className="inp num" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") })} placeholder={k === "cal" ? "250" : "0"} />
    </div>
  );
  const str = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : String(Math.round(v * 10) / 10));

  async function readLabel(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setReadMsg(null);
    setErr(null);
    const { data, error } = await aiRead<LabelRead>("label", file);
    setReading(false);
    if (error || !data) return setErr(error || "ما قدرنا نقرأ الملصق.");
    if (!data.readable) return setErr("ما قدرنا نقرأ الأرقام. صوري جدول القيم الغذائية قريب وواضح.");
    // Prefer per 100 g; else work it out from the serving; else keep per serving.
    let per100 = data.per100;
    if ((!per100 || per100.cal === null) && data.perServing && data.serving_g) {
      const k = 100 / data.serving_g;
      const sc = (v: number | null) => (v === null ? null : v * k);
      per100 = { cal: sc(data.perServing.cal), p: sc(data.perServing.p), c: sc(data.perServing.c), f: sc(data.perServing.f) };
    }
    const use100 = Boolean(per100 && per100.cal !== null);
    const m = use100 ? per100! : data.perServing;
    if (!m || m.cal === null) return setErr("ما لقينا السعرات في الصورة. اكتبيها بنفسك.");
    setF((cur) => ({
      ...cur,
      name: cur.name || data.name || "",
      basis: use100 ? "100g" : "serving",
      label: data.serving_label || cur.label,
      servingG: data.serving_g ? str(data.serving_g) : cur.servingG,
      cal: str(m.cal), p: str(m.p), c: str(m.c), f: str(m.f)
    }));
    setReadMsg("🤖 قرينا الملصق. راجعي الأرقام قبل ما تحفظين.");
  }

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.name.trim() || !Number(f.cal)) return setErr("اكتبي الاسم والسعرات على الأقل.");
        setBusy(true);
        const sg = Number(f.servingG) > 0 ? Number(f.servingG) : null;
        if (barcode && f.basis === "100g") {
          const row = { barcode, name: f.name.trim(), brand: null, cal: Number(f.cal), p: Number(f.p) || 0, c: Number(f.c) || 0, f: Number(f.f) || 0, serving_g: sg, serving_label: sg ? f.label.trim() || "حصة" : null, source: "label", added_by: profileId };
          const { error } = await supabase.from("barcode_products").insert(row);
          setBusy(false);
          if (error) return setErr("ما انحفظ. تأكدي إن الأرقام لكل ١٠٠ جم معقولة.");
          return onSaved(fromBarcode(row as BarcodeProduct));
        }
        const { data, error } = await supabase
          .from("foods")
          .insert({ owner_id: profileId, name: f.name.trim(), basis: f.basis, serving_label: f.basis === "serving" || sg ? f.label.trim() || "حصة" : null, serving_g: f.basis === "100g" ? sg : null, cal: Number(f.cal), p: Number(f.p) || 0, c: Number(f.c) || 0, f: Number(f.f) || 0 })
          .select("*")
          .single();
        setBusy(false);
        if (error || !data) return setErr("ما انحفظ. تأكدي إن الأرقام معقولة وجربي مرة ثانية.");
        onSaved(fromCustom(data as CustomFood));
      }}
    >
      {barcode ? <p className="small">باركود <b className="num" dir="ltr">{barcode}</b> ما كان عندنا. لما تحفظينه يلقاه الكل بعدين 🙌</p> : null}
      <label className="btn btn-s" style={{ cursor: reading ? "wait" : "pointer" }}>
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={reading} onChange={(e) => readLabel(e.target.files?.[0])} />
        {reading ? "لحظة... نقرأ الملصق 🔍" : "📸 صوري جدول القيم الغذائية ونعبيها لك"}
      </label>
      {readMsg ? <p className="alert info">{readMsg}</p> : <p className="note">أو اكتبي الأرقام من الملصق أو موقع المطعم. يتحفظ في «أكلاتي» وتلقينه المرة الجاية.</p>}
      <div className="field">
        <label htmlFor="nf-name">الاسم</label>
        <input id="nf-name" className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلًا: ساندويتش حلومي من ..." />
      </div>
      <div className="seg-tabs" role="group" aria-label="الأرقام لكل">
        <button type="button" aria-selected={f.basis === "serving"} onClick={() => setF({ ...f, basis: "serving" })}>لكل حصة / حبة</button>
        <button type="button" aria-selected={f.basis === "100g"} onClick={() => setF({ ...f, basis: "100g" })}>لكل ١٠٠ جم</button>
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="nf-label">اسم الحصة</label>
          <input id="nf-label" className="inp" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="حصة، حبة، علبة" />
        </div>
        {f.basis === "100g" ? (
          <div className="field">
            <label htmlFor="nf-sg">وزن الحصة (جم)</label>
            <input id="nf-sg" className="inp num" inputMode="decimal" value={f.servingG} onChange={(e) => setF({ ...f, servingG: e.target.value.replace(/[^\d.]/g, "") })} placeholder="اختياري" />
          </div>
        ) : null}
      </div>
      <div className="grid2">
        {num("cal", "🔥 السعرات")}
        {num("p", <MacLabel k="p" suffix="(جم)" />)}
        {num("c", <MacLabel k="c" suffix="(جم)" />)}
        {num("f", <MacLabel k="f" suffix="(جم)" />)}
      </div>
      {err ? <p className="alert err">{err}</p> : null}
      <button className="btn btn-p" type="submit" disabled={busy || reading}>{busy ? "لحظة..." : "احفظي وكملي"}</button>
    </form>
  );
}
