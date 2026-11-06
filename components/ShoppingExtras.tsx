"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type ShopItem = { id: string; name: string; amount: string | null; done: boolean };

/** Adds items to her own shopping list, merging the same item with the same unit ("500 غ" + "300 غ" = "800 غ"). */
export async function addShoppingItems(clientId: string, items: { name: string; amount: string }[]) {
  const { data, error } = await supabase.from("shopping_items").select("id, name, amount, done").eq("client_id", clientId).eq("done", false);
  if (error) return false;
  const open = (data as ShopItem[] | null) || [];
  const split = (a: string | null) => {
    const m = (a || "").match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    return m ? { n: Number(m[1]), u: m[2].trim() } : null;
  };
  for (const it of items) {
    const same = open.find((o) => o.name === it.name && split(o.amount)?.u === split(it.amount)?.u && split(o.amount) && split(it.amount));
    if (same) {
      const total = Math.round((split(same.amount)!.n + split(it.amount)!.n) * 10) / 10;
      const amount = `${total} ${split(it.amount)!.u}`.trim();
      await supabase.from("shopping_items").update({ amount }).eq("id", same.id);
      same.amount = amount;
    } else {
      const { data: row, error: e2 } = await supabase.from("shopping_items").insert({ client_id: clientId, name: it.name.slice(0, 120), amount: it.amount.slice(0, 40) || null }).select("id, name, amount, done").single();
      if (e2) return false;
      if (row) open.push(row as ShopItem);
    }
  }
  return true;
}

/** «أضيفي شي من عندك» and her own items, on the shopping list. */
export function ShoppingExtras({ clientId, legacy, onLegacyMoved }: { clientId: string; legacy?: { name: string; amount: string }[]; onLegacyMoved?: () => void }) {
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [form, setForm] = useState({ name: "", amount: "" });
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("shopping_items").select("id, name, amount, done").eq("client_id", clientId).order("created_at", { ascending: true });
    if (error) setMissing(true);
    setItems((data as ShopItem[] | null) || []);
  }, [clientId]);

  useEffect(() => {
    (async () => {
      // items added before they had their own table move over once
      if (legacy?.length) {
        if (await addShoppingItems(clientId, legacy)) onLegacyMoved?.();
      }
      load();
    })();
  }, [clientId, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim().slice(0, 120);
    if (!name) return;
    const { data } = await supabase.from("shopping_items").insert({ client_id: clientId, name, amount: form.amount.trim().slice(0, 40) || null }).select("id, name, amount, done").single();
    if (data) setItems((x) => [...(x || []), data as ShopItem]);
    setForm({ name: "", amount: "" });
  }
  async function toggle(it: ShopItem) {
    setItems((x) => (x || []).map((y) => (y.id === it.id ? { ...y, done: !y.done } : y)));
    await supabase.from("shopping_items").update({ done: !it.done }).eq("id", it.id);
  }
  async function remove(it: ShopItem) {
    setItems((x) => (x || []).filter((y) => y.id !== it.id));
    await supabase.from("shopping_items").delete().eq("id", it.id);
  }

  if (missing) return <p className="note">إضافة أغراض من عندك تشتغل قريب.</p>;
  return (
    <>
      <form className="card row shop-add" onSubmit={add}>
        <input className="inp" style={{ flex: 2, minWidth: 0 }} placeholder="أضيفي شي من عندك (مثلا: مناديل)" aria-label="اسم الغرض" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="inp" style={{ flex: 1, minWidth: 0 }} placeholder="الكمية" aria-label="الكمية (اختياري)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <button type="submit" className="btn btn-p" aria-label="أضيفي للقائمة" disabled={!form.name.trim()}><Plus /></button>
      </form>
      {items?.length ? (
        <section className="card" style={{ padding: "6px 16px" }}>
          {items.map((it, i) => (
            <div key={it.id} className="row" style={{ padding: "11px 0", borderTop: i ? "1px solid var(--line)" : 0, opacity: it.done ? 0.55 : 1 }}>
              <label className="row" style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <input type="checkbox" checked={it.done} onChange={() => toggle(it)} style={{ width: 20, height: 20, accentColor: "var(--clay)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, textDecoration: it.done ? "line-through" : "none" }}>{it.name} <span className="chip" style={{ fontSize: 10.5, padding: "1px 7px" }}>من عندك</span></span>
                {it.amount ? <span className="amt" style={{ fontWeight: 700, color: "var(--clay-ink)" }}>{it.amount}</span> : null}
              </label>
              <button type="button" className="icon-btn" aria-label={`احذفي ${it.name}`} onClick={() => remove(it)}><X size={16} /></button>
            </div>
          ))}
          {items.some((x) => x.done) ? (
            <button type="button" className="link small" style={{ minHeight: 36 }} onClick={async () => {
              const ids = items.filter((x) => x.done).map((x) => x.id);
              setItems(items.filter((x) => !x.done));
              await supabase.from("shopping_items").delete().in("id", ids);
            }}>شيلي اللي اشتريتيه</button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
