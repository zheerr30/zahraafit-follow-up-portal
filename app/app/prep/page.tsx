"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { ClientShell, Loading, useToast } from "@/components/ui";
import { MacLine } from "@/components/Mac";
import { addShoppingItems } from "@/components/ShoppingExtras";
import { accountOf } from "@/lib/account";
import { addDays } from "@/lib/followup";
import { resolve, type MealRef } from "@/lib/meal-resolve";
import { amountNum, applySwapsToPrep, boxShares, prepSteps, scaledText, servingsOf, storageFor, type Group, type PrepMeal } from "@/lib/meal-prep";
import { todayKey, type MealPlanData } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import { useClientPlans } from "@/lib/use-client";

type Recipe = { id: number; name: string; type: string; cal: number; p: number; c: number; f: number; ing: { n: string; a: number | string; u: string }[]; prep: string };
type Part = { name: string; gross: string; pot: string };
type Pick = { meal: PrepMeal; groups: Group[]; mode: "whole" | "parts"; parts: Part[]; freezer: number };

const TYPES = ["رئيسية", "إفطار", "سناك", "سلطة", "شوربة", "حلى", "سموذي"];
const num = (v: string) => {
  const n = Number(v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫,]/g, ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const net = (p: Part) => Math.max(0, num(p.gross) - num(p.pot));

function Stepper({ value, onChange, label, max = 14 }: { value: number; onChange: (v: number) => void; label: string; max?: number }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="أقل" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Minus size={16} /></button>
      <b className="num" aria-live="polite">{value}</b>
      <button type="button" aria-label="أكثر" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={16} /></button>
    </span>
  );
}

/** «حضري وجباتك»: pick meals and servings, cook from a scaled list, split the pot, save ready boxes. */
export default function PrepPage() {
  const auth = useAuthGuard("client");
  const cp = useClientPlans(auth.profile);
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("رئيسية");
  const [swaps, setSwaps] = useState<{ meals: Record<string, MealRef>; ings: Record<string, string> }>({ meals: {}, ings: {} });
  const [have, setHave] = useState<Set<string>>(new Set());
  const [myTarget, setMyTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const acc = accountOf(auth.profile);
  const plan = acc.sub ? ((cp.mealRow?.data as MealPlanData | undefined) || null) : null;

  useEffect(() => {
    if (cp.loading || !cp.client) return;
    (async () => {
      if (plan && cp.mealRow) {
        const { data } = await supabase.from("plan_choices").select("data").eq("plan_id", cp.mealRow.id).maybeSingle();
        const d = (data?.data || {}) as { meals?: Record<string, MealRef>; ings?: Record<string, string> };
        setSwaps({ meals: d.meals || {}, ings: d.ings || {} });
        setMyTarget(plan.target.cal || null);
      } else {
        const { data: t } = await supabase.from("food_targets").select("cal").eq("client_id", cp.client!.id).maybeSingle();
        setMyTarget((t as { cal: number } | null)?.cal || null);
        const { data: s } = await supabase.auth.getSession();
        const res = await fetch("/api/recipes", { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` } });
        setRecipes(res.ok ? ((await res.json()) as Recipe[]) : []);
      }
    })();
  }, [cp.loading, cp.client, cp.mealRow, plan]);

  // Her plan's meals (with her swaps), each once.
  const planMeals = useMemo(() => {
    if (!plan) return [] as PrepMeal[];
    const seen = new Map<string, PrepMeal>();
    plan.days.forEach((d, di) =>
      d.meals.forEach((_, mi) => {
        const key = `${di}-${mi}`;
        const m = resolve(plan, swaps.meals[key], di, mi);
        if (seen.has(m.name)) return;
        const changed = m.ingredients.map((ing) => ({ ing, to: swaps.ings[`${key}-${m.name}-${ing.n}`] }));
        seen.set(m.name, {
          key,
          name: m.name,
          slot: plan.days[di].meals[mi].slot,
          cal: m.cal, p: m.p, c: m.c, f: m.f,
          ingredients: changed.map(({ ing, to }) => (to ? { n: to.replace(/\s*\d+(?:[.,]\d+)?\s*(غ|جم|مل|حبة|حبات)?\s*$/, "").trim() || to, a: amountNum(to.match(/\d+(?:[.,]\d+)?\s*(غ|جم|مل|حبة|حبات)?\s*$/)?.[0] || "") ?? 0, u: to.match(/(غ|جم|مل|حبة|حبات)\s*$/)?.[1] || (amountNum(to) ? "" : "حسب الذوق") } : ing)),
          prep: applySwapsToPrep(m.prep, changed.filter((x) => x.to).map((x) => ({ from: x.ing.n, to: x.to! })))
        });
      })
    );
    return Array.from(seen.values());
  }, [plan, swaps]);

  // Coming from «حضري منها كمية» on a meal: start with it × 5.
  useEffect(() => {
    if (!planMeals.length || picks.length) return;
    const p = new URLSearchParams(window.location.search);
    const d = p.get("d"), m = p.get("m");
    if (d === null || m === null || !plan) return;
    const meal = resolve(plan, swaps.meals[`${d}-${m}`], Number(d), Number(m));
    const pm = planMeals.find((x) => x.name === meal?.name);
    if (pm) setCount(pm, 5);
  }, [planMeals]); // eslint-disable-line react-hooks/exhaustive-deps

  function countOf(meal: PrepMeal) {
    const p = picks.find((x) => x.meal.key === meal.key);
    return p ? servingsOf(p.groups) : 0;
  }
  function setCount(meal: PrepMeal, n: number) {
    setPicks((ps) => {
      const rest = ps.filter((x) => x.meal.key !== meal.key);
      if (n <= 0) return rest;
      const cur = ps.find((x) => x.meal.key === meal.key);
      if (cur) return ps.map((x) => (x.meal.key === meal.key ? { ...x, groups: x.groups.length === 1 ? [{ ...x.groups[0], portions: n }] : x.groups } : x));
      const big = meal.ingredients.filter((i) => /غ|جم|مل/.test(i.u) && (amountNum(i.a) || 0) >= 60).slice(0, 2).map((i) => ({ name: i.n, gross: "", pot: "" }));
      return [...rest, { meal, groups: [{ label: "أنا", portions: n, target: myTarget }], mode: "whole", parts: big.length > 1 ? big : [{ name: "", gross: "", pot: "" }, { name: "", gross: "", pot: "" }], freezer: 0 }];
    });
  }
  const update = (key: string, patch: Partial<Pick>) => setPicks((ps) => ps.map((x) => (x.meal.key === key ? { ...x, ...patch } : x)));
  const fromRecipe = (r: Recipe): PrepMeal => ({ key: `r${r.id}`, name: r.name, slot: r.type, type: r.type, cal: r.cal, p: r.p, c: r.c, f: r.f, ingredients: r.ing, prep: r.prep });

  if (auth.loading || cp.loading) return <Loading />;
  if (!auth.profile || !cp.client) return null;
  const clientId = cp.client.id;
  const total = picks.reduce((a, p) => a + servingsOf(p.groups), 0);

  async function toShopping() {
    const need = new Map<string, { name: string; amount: string }>();
    for (const p of picks) {
      const n = servingsOf(p.groups);
      p.meal.ingredients.forEach((ing) => {
        if (have.has(`${p.meal.key}|${ing.n}`) || !amountNum(ing.a)) return;
        const text = scaledText(ing, n);
        const k = `${ing.n}|${ing.u}`;
        const prev = need.get(k);
        need.set(k, { name: ing.n, amount: prev ? `${Math.round(((amountNum(prev.amount) || 0) + (amountNum(text) || 0)) * 10) / 10} ${ing.u}` : text });
      });
    }
    if (!need.size) return toast.show("كل شي عندك 👌");
    const ok = await addShoppingItems(clientId, Array.from(need.values()));
    toast.show(ok ? `انضاف ${need.size} غرض لقائمة التسوق 🛒` : "قائمة التسوق تشتغل قريب.");
  }

  async function save() {
    setBusy(true);
    const today = todayKey();
    const rows = picks.flatMap((p) => {
      const n = servingsOf(p.groups);
      const st = storageFor(p.meal);
      const shares = boxShares(p.groups);
      const parts = p.mode === "parts" ? p.parts.filter((x) => x.name.trim() && net(x) > 0) : [];
      const whole = p.mode === "whole" ? net(p.parts[0] || { name: "", gross: "", pot: "" }) : 0;
      const batch = crypto.randomUUID();
      const freezeFrom = shares.length - Math.min(p.freezer, shares.length);
      return shares.map((s, i) => {
        const k = s.share * n; // this box = k servings of the recipe
        const grams = parts.length ? parts.reduce((a, x) => a + net(x) * s.share, 0) : whole ? whole * s.share : null;
        const detail = parts.length ? parts.map((x) => `${x.name.trim()} ${Math.round(net(x) * s.share)} جم`).join(" + ") : null;
        const g = p.groups[s.group];
        const freezer = st.freezer !== null && i >= freezeFrom;
        return {
          client_id: clientId, batch, name: `${p.meal.name}${p.groups.length > 1 && g.label ? ` (${g.label})` : ""}`.slice(0, 160), detail,
          grams: grams ? Math.round(grams) : null,
          cal: Math.round(p.meal.cal * k), p: Math.round(p.meal.p * k * 10) / 10, c: Math.round(p.meal.c * k * 10) / 10, f: Math.round(p.meal.f * k * 10) / 10,
          made_on: today, place: freezer ? "freezer" : "fridge", fridge_days: st.fridge, freezer_days: st.freezer,
          use_by: addDays(today, freezer ? st.freezer! : st.fridge)
        };
      });
    });
    const { error } = await supabase.from("prep_boxes").insert(rows);
    setBusy(false);
    if (error) return toast.show(error.code === "42P01" ? "العلب الجاهزة تشتغل قريب." : "ما انحفظت. تأكدي من الاتصال وجربي مرة ثانية.");
    router.push("/app/food?boxes=1");
  }

  const filtered = (recipes || []).filter((r) => (q.trim() ? r.name.includes(q.trim()) : r.type === type)).slice(0, 40);
  const stepNames = ["اختاري", "اطبخي", "قسمي", "احفظي"];

  return (
    <ClientShell title="🍱 حضري وجباتك" sub={`الخطوة ${step} من 4: ${stepNames[step - 1]}`}>
      <div className="prep-steps-bar" aria-hidden="true">{stepNames.map((s, i) => <i key={s} className={i < step ? "on" : ""} />)}</div>

      {step === 1 ? (
        <>
          <div className="tip-card">
            <span className="em" aria-hidden="true">🍱</span>
            <span>اختاري الوجبات اللي بتطبخينها مرة وحدة، وكم حصة من كل وحدة. تقدرين تختارين أكثر من وجبة.</span>
          </div>
          {plan ? (
            <section className="card" style={{ padding: "2px 14px" }}>
              {planMeals.map((m) => (
                <div key={m.key} className="prep-pick">
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <small className="muted">{m.slot}</small>
                    <b>{m.name}</b>
                    <span className="note"><b className="num">{m.cal}</b> سعرة · <MacLine p={Math.round(m.p)} c={Math.round(m.c)} f={Math.round(m.f)} /></span>
                  </span>
                  <Stepper value={countOf(m)} onChange={(v) => setCount(m, v)} label={`حصص ${m.name}`} />
                </div>
              ))}
            </section>
          ) : (
            <>
              <div className="unit" style={{ position: "relative" }}>
                <Search size={18} style={{ position: "absolute", insetInlineStart: 12, top: 13, color: "var(--ink-3)" }} />
                <input className="inp" style={{ paddingInlineStart: 38 }} placeholder="دوري وصفة" aria-label="دوري وصفة" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {!q.trim() ? (
                <div className="chip-toggles">
                  {TYPES.map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>)}
                </div>
              ) : null}
              {recipes === null ? <Loading /> : (
                <section className="card" style={{ padding: "2px 14px" }}>
                  {filtered.map((r) => {
                    const m = fromRecipe(r);
                    return (
                      <div key={r.id} className="prep-pick">
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <b>{r.name}</b>
                          <span className="note"><b className="num">{r.cal}</b> سعرة · <MacLine p={Math.round(r.p)} c={Math.round(r.c)} f={Math.round(r.f)} /></span>
                        </span>
                        <Stepper value={countOf(m)} onChange={(v) => setCount(m, v)} label={`حصص ${r.name}`} />
                      </div>
                    );
                  })}
                  {!filtered.length ? <p className="note" style={{ padding: 14 }}>ما لقينا وصفة بهالاسم.</p> : null}
                </section>
              )}
            </>
          )}
          {picks.length ? (
            <div className="prep-foot">
              <span className="small"><b className="num">{picks.length}</b> وجبات · <b className="num">{total}</b> حصة</span>
              <button type="button" className="btn btn-p" onClick={() => setStep(2)}>التالي: قائمة الطبخ</button>
            </div>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="tip-card">
            <span className="em" aria-hidden="true">🧑‍🍳</span>
            <span>الكميات نيئة ومضروبة في عدد الحصص بنفس النسب. علمي «عندي» على اللي موجود عندك، والباقي ينضاف للتسوق.</span>
          </div>
          {picks.map((p) => {
            const n = servingsOf(p.groups);
            return (
              <section key={p.meal.key} className="card stack">
                <div className="row between"><b>{p.meal.name}</b><span className="chip">× {n} حصص</span></div>
                <div>
                  {p.meal.ingredients.map((ing) => {
                    const k = `${p.meal.key}|${ing.n}`;
                    const taste = !amountNum(ing.a);
                    return (
                      <label key={k} className="prep-ing">
                        {taste ? <span style={{ width: 20 }} /> : <input type="checkbox" checked={have.has(k)} onChange={() => setHave((h) => { const x = new Set(h); if (x.has(k)) x.delete(k); else x.add(k); return x; })} aria-label={`عندي ${ing.n}`} />}
                        <span style={{ flex: 1, minWidth: 0 }}>{ing.n}</span>
                        <b className="num" style={{ color: taste ? "var(--ink-3)" : "var(--clay-ink)" }}>{scaledText(ing, n)}</b>
                      </label>
                    );
                  })}
                </div>
                {prepSteps(p.meal.prep).length ? (
                  <details className="gsec" open>
                    <summary><span className="em" aria-hidden="true">📝</span><span><b>طريقة التحضير</b></span></summary>
                    <ol className="recs-list gbody">{prepSteps(p.meal.prep).map((s, i) => <li key={i}>{s}</li>)}</ol>
                  </details>
                ) : null}
              </section>
            );
          })}
          <button type="button" className="btn btn-s btn-block" onClick={toShopping}>🛒 أضيفي الناقص للتسوق</button>
          <div className="prep-foot">
            <button type="button" className="btn btn-g" onClick={() => setStep(1)}>رجوع</button>
            <button type="button" className="btn btn-p" onClick={() => setStep(3)}>طبخت، نقسم</button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className="tip-card">
            <span className="em" aria-hidden="true">⚖️</span>
            <span>وزني الأكل المطبوخ كامل بدون القدر. أو اكتبي وزن القدر فاضي، ونطرحه حنا. والتطبيق يقسم على العلب.</span>
          </div>
          {picks.map((p) => {
            const shares = boxShares(p.groups);
            const multi = p.groups.length > 1;
            const parts = p.mode === "parts" ? p.parts : p.parts.slice(0, 1);
            return (
              <section key={p.meal.key} className="card stack">
                <div className="row between"><b>{p.meal.name}</b><span className="chip">{servingsOf(p.groups)} علب</span></div>

                <div className="seg-tabs" role="tablist" aria-label="طريقة الوزن">
                  <button type="button" role="tab" aria-selected={p.mode === "whole"} onClick={() => update(p.meal.key, { mode: "whole" })}>القدر كامل</button>
                  <button type="button" role="tab" aria-selected={p.mode === "parts"} onClick={() => update(p.meal.key, { mode: "parts", parts: p.parts.length > 1 ? p.parts : [...p.parts, { name: "", gross: "", pot: "" }] })}>كل مكون لحاله</button>
                </div>
                {parts.map((x, i) => (
                  <div key={i} className="prep-part">
                    {p.mode === "parts" ? (
                      <div className="row" style={{ gap: 6 }}>
                        <input className="inp" placeholder={i === 0 ? "مثلا: رز" : "مثلا: دجاج"} aria-label="اسم المكون" value={x.name} onChange={(e) => update(p.meal.key, { parts: p.parts.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
                        {p.parts.length > 2 ? <button type="button" className="icon-btn" aria-label="شيلي المكون" onClick={() => update(p.meal.key, { parts: p.parts.filter((_, j) => j !== i) })}><X size={16} /></button> : null}
                      </div>
                    ) : null}
                    <div className="grid2">
                      <div className="field"><label>الوزن المطبوخ (جم)</label><input className="inp num" inputMode="decimal" value={x.gross} onChange={(e) => update(p.meal.key, { parts: p.parts.map((y, j) => (j === i ? { ...y, gross: e.target.value } : y)) })} /></div>
                      <div className="field"><label>وزن القدر فاضي <span className="muted">(اختياري)</span></label><input className="inp num" inputMode="decimal" value={x.pot} onChange={(e) => update(p.meal.key, { parts: p.parts.map((y, j) => (j === i ? { ...y, pot: e.target.value } : y)) })} /></div>
                    </div>
                  </div>
                ))}
                {p.mode === "parts" ? <button type="button" className="link small" style={{ alignSelf: "flex-start", minHeight: 32 }} onClick={() => update(p.meal.key, { parts: [...p.parts, { name: "", gross: "", pot: "" }] })}>+ مكون ثاني</button> : null}

                <details className="gsec" open={multi}>
                  <summary><span className="em" aria-hidden="true">👥</span><span><b>حصص لأكثر من شخص؟</b><span className="sub">لو أهدافكم مختلفة، القسمة تصير حسب سعرات كل واحد</span></span></summary>
                  <div className="gbody stack">
                    {p.groups.map((g, gi) => (
                      <div key={gi} className="row" style={{ gap: 6, alignItems: "flex-end" }}>
                        <div className="field" style={{ flex: 1.3 }}><label>مين</label><input className="inp" value={g.label} onChange={(e) => update(p.meal.key, { groups: p.groups.map((y, j) => (j === gi ? { ...y, label: e.target.value } : y)) })} /></div>
                        <div className="field" style={{ flex: 1 }}><label>هدفه اليومي</label><input className="inp num" inputMode="numeric" value={g.target ?? ""} onChange={(e) => update(p.meal.key, { groups: p.groups.map((y, j) => (j === gi ? { ...y, target: num(e.target.value) || null } : y)) })} /></div>
                        <div className="field" style={{ flex: "none" }}><label>علب</label><Stepper value={g.portions} label={`علب ${g.label}`} onChange={(v) => update(p.meal.key, { groups: p.groups.map((y, j) => (j === gi ? { ...y, portions: v } : y)).filter((y, j) => y.portions > 0 || j === 0) })} /></div>
                      </div>
                    ))}
                    <button type="button" className="link small" style={{ alignSelf: "flex-start", minHeight: 32 }} onClick={() => update(p.meal.key, { groups: [...p.groups, { label: "شخص ثاني", portions: 2, target: null }] })}>+ شخص ثاني</button>
                    {multi && !p.groups.every((g) => g.target) ? <p className="note">اكتبي هدف كل شخص، وإلا نقسم بالتساوي.</p> : null}
                  </div>
                </details>

                {(() => {
                  const ready = (p.mode === "whole" ? net(parts[0] || { name: "", gross: "", pot: "" }) > 0 : parts.some((x) => x.name.trim() && net(x) > 0)) && shares.length;
                  if (!ready) return <p className="note">اكتبي الوزن وتطلع لك القسمة.</p>;
                  return (
                    <div className="prep-result">
                      {p.groups.map((g, gi) => {
                        const s = shares.find((x) => x.group === gi);
                        if (!s || !g.portions) return null;
                        const per = p.mode === "whole"
                          ? `${Math.round(net(parts[0]) * s.share)} جرام`
                          : parts.filter((x) => x.name.trim() && net(x) > 0).map((x) => `${x.name.trim()} ${Math.round(net(x) * s.share)} جرام`).join(" + ");
                        const k = s.share * servingsOf(p.groups);
                        return (
                          <p key={gi}>
                            {multi ? <b>{g.label}: </b> : null}حطي <b className="num">{per}</b> بكل علبة
                            <span className="note" style={{ display: "block" }}>{g.portions} علب · كل علبة <b className="num">{Math.round(p.meal.cal * k)}</b> سعرة</span>
                          </p>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            );
          })}
          <div className="prep-foot">
            <button type="button" className="btn btn-g" onClick={() => setStep(2)}>رجوع</button>
            <button type="button" className="btn btn-p" onClick={() => setStep(4)}>التالي: الحفظ</button>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          {picks.map((p) => {
            const st = storageFor(p.meal);
            const n = servingsOf(p.groups);
            return (
              <section key={p.meal.key} className="card stack">
                <b>{p.meal.name} · {n} علب</b>
                <div className="grid2">
                  <div className="stat"><span>❄️ الثلاجة</span><b className="num">{st.fridge} {st.fridge === 1 ? "يوم" : st.fridge === 2 ? "يومين" : "أيام"}</b></div>
                  <div className="stat"><span>🧊 الفريزر</span><b className="num">{st.freezer ? `${Math.round(st.freezer / 30)} ${st.freezer >= 90 ? "شهور" : st.freezer >= 60 ? "شهرين" : "شهر"}` : "ما تنفع"}</b></div>
                </div>
                <p className="note">💡 {st.tip}</p>
                {st.freezer ? (
                  <div className="row between">
                    <span className="small">كم علبة بتحطينها بالفريزر؟</span>
                    <Stepper value={p.freezer} max={n} label="علب الفريزر" onChange={(v) => update(p.meal.key, { freezer: v })} />
                  </div>
                ) : null}
              </section>
            );
          })}
          <p className="note">المدد تقريبية وحسب إرشادات سلامة الغذاء. لو تغير شكل الأكل أو ريحته لا تاكلينه.</p>
          <div className="prep-foot">
            <button type="button" className="btn btn-g" onClick={() => setStep(3)}>رجوع</button>
            <button type="button" className="btn btn-p" disabled={busy} onClick={save}>{busy ? "لحظة..." : `احفظي ${total} علب جاهزة`}</button>
          </div>
        </>
      ) : null}

      <p className="note" style={{ textAlign: "center" }}><Link className="link" href="/app/food">رجوع لأكلي</Link></p>
      {toast.node}
    </ClientShell>
  );
}
