"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Share2, X } from "lucide-react";
import { addShoppingItems, type ShopItem } from "@/components/ShoppingExtras";
import { SECTION_EMOJI, SHOP_SECTIONS, sectionOf, type ShopSection } from "@/lib/shop-cats";
import { supabase } from "@/lib/supabase";

export type PlanShopItem = { key: string; name: string; amount: string };
type Line = { id: string; name: string; amount: string; done: boolean; mine: boolean };

/**
 * «🛒 تسوق»: her plan's items (merged, summed) and her own, in sections.
 * Bought items go to the bottom of their section; share the list to WhatsApp as text.
 */
export function ShoppingList({ clientId, planItems = [], bought = {}, onTogglePlan, onClearPlan, taste = [], days, legacy, onLegacyMoved }: {
  clientId: string;
  planItems?: PlanShopItem[];
  bought?: Record<string, boolean>;
  onTogglePlan?: (key: string) => void;
  onClearPlan?: () => void;
  taste?: string[];
  days?: number | null;
  legacy?: { name: string; amount: string }[];
  onLegacyMoved?: () => void;
}) {
  const [mine, setMine] = useState<ShopItem[]>([]);
  const [form, setForm] = useState({ name: "", amount: "" });
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("shopping_items").select("id, name, amount, done").eq("client_id", clientId).order("created_at", { ascending: true });
    if (error) setMissing(true);
    setMine((data as ShopItem[] | null) || []);
  }, [clientId]);
  useEffect(() => {
    (async () => {
      if (legacy?.length && (await addShoppingItems(clientId, legacy))) onLegacyMoved?.();
      load();
    })();
  }, [clientId, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim().slice(0, 120);
    if (!name) return;
    const { data } = await supabase.from("shopping_items").insert({ client_id: clientId, name, amount: form.amount.trim().slice(0, 40) || null }).select("id, name, amount, done").single();
    if (data) setMine((x) => [...x, data as ShopItem]);
    setForm({ name: "", amount: "" });
  }
  async function toggleMine(id: string) {
    const it = mine.find((x) => x.id === id);
    if (!it) return;
    setMine((x) => x.map((y) => (y.id === id ? { ...y, done: !y.done } : y)));
    await supabase.from("shopping_items").update({ done: !it.done }).eq("id", id);
  }
  async function removeMine(id: string) {
    setMine((x) => x.filter((y) => y.id !== id));
    await supabase.from("shopping_items").delete().eq("id", id);
  }

  const lines: Line[] = [
    ...planItems.map((p) => ({ id: p.key, name: p.name, amount: p.amount, done: Boolean(bought[p.key]), mine: false })),
    ...mine.map((m) => ({ id: m.id, name: m.name, amount: m.amount || "", done: m.done, mine: true }))
  ];
  const bySection = new Map<ShopSection, Line[]>();
  lines.forEach((l) => {
    const s = sectionOf(l.name);
    bySection.set(s, [...(bySection.get(s) || []), l]);
  });
  const doneCount = lines.filter((l) => l.done).length;

  function share() {
    const parts: string[] = ["🛒 قائمة تسوقي"];
    for (const sec of SHOP_SECTIONS) {
      const left = (bySection.get(sec) || []).filter((l) => !l.done);
      if (!left.length) continue;
      parts.push("", `${SECTION_EMOJI[sec]} ${sec}`, ...left.map((l) => `• ${l.name}${l.amount ? ` (${l.amount})` : ""}`));
    }
    if (taste.length) parts.push("", "🧂 حسب الذوق", taste.join("، "));
    window.open(`https://wa.me/?text=${encodeURIComponent(parts.join("\n"))}`, "_blank", "noopener");
  }

  return (
    <>
      {days ? <p className="shop-sub">لـ {days} أيام، بالوزن النيء</p> : null}
      <form className="card row shop-add" onSubmit={add}>
        <input className="inp" style={{ flex: 2, minWidth: 0 }} placeholder="أضيفي شي من عندك" aria-label="اسم الغرض" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="inp" style={{ flex: 1, minWidth: 0 }} placeholder="الكمية" aria-label="الكمية (اختياري)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <button type="submit" className="btn btn-p" aria-label="أضيفي للقائمة" disabled={!form.name.trim() || missing}><Plus /></button>
      </form>
      {lines.length ? (
        <div className="row between">
          <span className="small"><b className="num">اشتريتي {doneCount} من {lines.length}</b></span>
          <button type="button" className="share-btn" style={{ margin: 0 }} onClick={share}><Share2 size={14} /> شاركي القائمة</button>
        </div>
      ) : null}
      {SHOP_SECTIONS.map((sec) => {
        const list = bySection.get(sec);
        if (!list?.length) return null;
        const sorted = [...list].sort((a, b) => Number(a.done) - Number(b.done));
        return (
          <section key={sec} className="card shop-sec">
            <b className="shop-sec-h"><span className="emo" aria-hidden="true">{SECTION_EMOJI[sec]}</span>{sec}</b>
            {sorted.map((l) => (
              <div key={l.id} className={`shop-line ${l.done ? "done" : ""}`}>
                <label>
                  <input type="checkbox" checked={l.done} onChange={() => (l.mine ? toggleMine(l.id) : onTogglePlan?.(l.id))} />
                  <span className="nm">{l.name}{l.mine ? <span className="chip mine">من عندك</span> : null}</span>
                  {l.amount ? <span className="amt">{l.amount}</span> : null}
                </label>
                {l.mine ? <button type="button" className="icon-btn" aria-label={`احذفي ${l.name}`} onClick={() => removeMine(l.id)}><X size={16} /></button> : null}
              </div>
            ))}
          </section>
        );
      })}
      {taste.length ? (
        <section className="card shop-sec">
          <b className="shop-sec-h"><span className="emo" aria-hidden="true">🧂</span>حسب الذوق</b>
          <p className="small" style={{ lineHeight: 2, margin: 0 }}>{taste.join("، ")}</p>
        </section>
      ) : null}
      {doneCount ? (
        <button type="button" className="btn btn-g" onClick={async () => {
          onClearPlan?.();
          const ids = mine.filter((m) => m.done).map((m) => m.id);
          setMine((x) => x.filter((m) => !m.done));
          if (ids.length) await supabase.from("shopping_items").delete().in("id", ids);
        }}>امسحي اللي اشتريتيه وابدئي قائمة جديدة</button>
      ) : null}
    </>
  );
}
