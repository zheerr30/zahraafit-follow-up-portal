"use client";

import { Dot, MacLabel, MacLine } from "@/components/Mac";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { RestItem, Restaurant } from "@/components/Restaurants";

/** Coach: restaurants and their items; mark the best choices with a tip, fix numbers, remove. */
export function CoachRestaurants() {
  const [rests, setRests] = useState<Restaurant[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<RestItem[]>([]);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("restaurants").select("id, name, emoji").order("name").then(({ data, error }) => {
      if (error) setMsg("شغلي ملف phase11-restaurants.sql في Supabase أول.");
      setRests((data as Restaurant[] | null) || []);
    });
  }, []);

  async function toggleRest(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setItems([]);
    const { data } = await supabase.from("restaurant_items").select("*").eq("restaurant_id", id).order("coach_pick", { ascending: false }).order("name");
    setItems((data as RestItem[] | null) || []);
  }

  async function patch(it: RestItem, p: Partial<RestItem>) {
    const next = { ...it, ...p };
    setItems((l) => l.map((x) => (x.id === it.id ? next : x)));
    const { error } = await supabase.from("restaurant_items").update(p).eq("id", it.id);
    if (error) setMsg("ما انحفظ التعديل.");
  }

  async function removeItem(id: string) {
    await supabase.from("restaurant_items").delete().eq("id", id);
    setItems((l) => l.filter((x) => x.id !== id));
  }

  async function addRest() {
    if (!newName.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("restaurants").insert({ name: newName.trim(), added_by: u.user?.id }).select("id, name, emoji").single();
    if (error || !data) return setMsg(error?.code === "23505" ? "المطعم موجود." : "ما انحفظ.");
    setRests((l) => [...(l || []), data as Restaurant].sort((a, b) => a.name.localeCompare(b.name, "ar")));
    setNewName("");
  }

  async function removeRest(r: Restaurant) {
    if (!window.confirm(`تحذفين ${r.name} وكل أصنافه؟`)) return;
    await supabase.from("restaurants").delete().eq("id", r.id);
    setRests((l) => (l || []).filter((x) => x.id !== r.id));
  }

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <>
      <div className="sec-title" style={{ marginTop: 14 }}>
        <span className="em" aria-hidden="true">🍔</span>
        <h2>المطاعم</h2>
      </div>
      <p className="small muted">المشتركين يضيفون أصناف المطاعم من صور المنيو. إنتي حددي ⭐ أفضل الخيارات واكتبي نصيحة، وعدلي أي رقم غلط.</p>
      {msg ? <p className="alert info">{msg}</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <input className="inp" aria-label="مطعم جديد" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مطعم جديد" style={{ flex: 1 }} />
        <button type="button" className="btn btn-s" onClick={addRest} disabled={!newName.trim()}>أضيفي</button>
      </div>
      {(rests || []).map((r) => (
        <section key={r.id} className="card" style={{ padding: 0 }}>
          <div className="row between" style={{ padding: "10px 14px" }}>
            <button type="button" style={{ flex: 1, textAlign: "start", fontWeight: 700 }} aria-expanded={open === r.id} onClick={() => toggleRest(r.id)}>
              {r.emoji || "🍽️"} {r.name}
            </button>
            <button type="button" className="icon-btn" aria-label={`احذفي ${r.name}`} onClick={() => removeRest(r)}><Trash2 size={16} /></button>
          </div>
          {open === r.id ? (
            <div style={{ padding: "0 14px 12px" }}>
              {!items.length ? <p className="note">ما فيه أصناف للحين.</p> : null}
              {items.map((it) => (
                <div key={it.id} className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                  <div className="row between" style={{ gap: 8 }}>
                    <button type="button" className="fav-star" style={{ width: 38, height: 38, fontSize: 20 }} aria-pressed={it.coach_pick} aria-label={it.coach_pick ? "شيليه من اختياراتك" : "اختياري الأفضل"} onClick={() => patch(it, { coach_pick: !it.coach_pick })}>{it.coach_pick ? "⭐" : "☆"}</button>
                    <b style={{ flex: 1, minWidth: 0 }}>{it.name}</b>
                    <button type="button" className="icon-btn" aria-label={`احذفي ${it.name}`} onClick={() => removeItem(it.id)}><Trash2 size={15} /></button>
                  </div>
                  <div className="grid2" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {([["cal", "سعرات"], ["p", "بروتين"], ["c", "كارب"], ["f", "دهون"]] as const).map(([k, l]) => (
                      <input key={k} className="inp num" inputMode="decimal" aria-label={`${l} ${it.name}`} placeholder={l} defaultValue={it[k] === null ? "" : String(Number(it[k]))} style={{ minHeight: 38 }}
                        onBlur={(e) => { const v = num(e.target.value.replace(/[^\d.]/g, "")); if (k === "cal" && !v) return; if (v !== (it[k] === null ? null : Number(it[k]))) patch(it, { [k]: v } as Partial<RestItem>); }} />
                    ))}
                  </div>
                  {it.coach_pick ? (
                    <input className="inp" aria-label={`نصيحة ${it.name}`} defaultValue={it.tip || ""} placeholder="💡 نصيحة: مثلًا اطلبيه بدون صوص" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== it.tip) patch(it, { tip: v }); }} />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
