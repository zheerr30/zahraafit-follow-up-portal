"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MacLine } from "@/components/Mac";
import { formatDate } from "@/lib/format";
import { useToast } from "@/components/ui";
import { addDays, daysBetween } from "@/lib/followup";
import { defaultSlot } from "@/lib/foods";
import { todayKey } from "@/lib/plan-data";
import { supabase } from "@/lib/supabase";

export type Box = { id: string; batch: string; name: string; detail: string | null; grams: number | null; cal: number; p: number; c: number; f: number; made_on: string; place: "fridge" | "freezer"; fridge_days: number; use_by: string };

/** Days left before a box should be eaten (negative = past). */
export const boxDaysLeft = (b: Pick<Box, "use_by">, today = todayKey()) => daysBetween(today, b.use_by);

export async function loadBoxes(clientId: string) {
  const { data, error } = await supabase.from("prep_boxes").select("*").eq("client_id", clientId).is("eaten_at", null).order("use_by", { ascending: true });
  return error ? null : ((data as Box[] | null) || []);
}

/** «🍱 علب جاهزة» in «أكلي»: tap a box when she eats it and it's logged with its calories. */
export function PrepBoxes({ clientId, onLogged }: { clientId: string; onLogged?: () => void }) {
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const toast = useToast();
  const today = todayKey();
  const load = useCallback(() => loadBoxes(clientId).then(setBoxes), [clientId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!boxes) return null;

  async function eat(b: Box) {
    const { error } = await supabase.from("food_entries").insert({ client_id: clientId, log_date: today, slot: defaultSlot(), name: `🍱 ${b.name}`.slice(0, 160), amount: 1, unit: "علبة", cal: b.cal, p: b.p, c: b.c, f: b.f });
    if (error) return toast.show("ما انسجلت. تأكدي من الاتصال وجربي مرة ثانية.");
    await supabase.from("prep_boxes").update({ eaten_at: new Date().toISOString() }).eq("id", b.id);
    toast.show(`سجلناها ✅ ${Math.round(b.cal)} سعرة`);
    load();
    onLogged?.();
  }
  async function thaw(b: Box) {
    await supabase.from("prep_boxes").update({ place: "fridge", use_by: addDays(today, Math.min(2, b.fridge_days)) }).eq("id", b.id);
    toast.show("طلعت للثلاجة ✅ كليها خلال يومين");
    load();
  }
  async function toss(b: Box) {
    await supabase.from("prep_boxes").delete().eq("id", b.id);
    load();
  }

  // one row per batch + name + place, with how many are left
  const groups = new Map<string, Box[]>();
  boxes.forEach((b) => {
    const k = `${b.batch}|${b.name}|${b.place}|${b.use_by}`;
    groups.set(k, [...(groups.get(k) || []), b]);
  });

  return (
    <>
      <div className="sec-title">
        <span className="em" aria-hidden="true">🍱</span>
        <h2>علب جاهزة</h2>
        <Link href="/app/prep" className="aside link">+ حضري وجبات</Link>
      </div>
      {!boxes.length ? (
        <section className="card empty-mini">
          <p className="small muted">لما تطبخين كمية وتقسمينها علب، تطلع هنا. وكل ما تاكلين علبة تضغطين عليها وتنسجل بسعراتها.</p>
          <Link className="btn btn-s btn-sm" href="/app/prep">حضري وجباتك</Link>
        </section>
      ) : (
        <section className="card" style={{ padding: "2px 14px" }}>
          {Array.from(groups.values()).map((list) => {
            const b = list[0];
            const left = boxDaysLeft(b, today);
            const warn = b.place === "fridge" && left <= 1;
            return (
              <div key={b.id} className="box-row">
                <span className="box-ic" aria-hidden="true">{b.place === "freezer" ? "🧊" : "🍱"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{b.name}</b> <span className="chip">× {list.length}</span>
                  <span className="note" style={{ display: "block" }}>
                    <b className="num">{Math.round(b.cal)}</b> سعرة · <MacLine p={Math.round(b.p)} c={Math.round(b.c)} f={Math.round(b.f)} />
                    {b.detail ? <> · {b.detail}</> : b.grams ? <> · {Math.round(b.grams)} غ</> : null}
                  </span>
                  <span className={`box-exp ${left < 0 ? "bad" : warn ? "warn" : ""}`}>
                    {b.place === "freezer" ? `بالفريزر لين ${formatDate(b.use_by)}` : left < 0 ? "انتهت مدتها، لا تاكلينها" : left === 0 ? "كليها اليوم" : left === 1 ? "كليها بكرة بالكثير" : `باقي ${left} أيام بالثلاجة`}
                  </span>
                </span>
                {left < 0 && b.place === "fridge" ? (
                  <button type="button" className="btn btn-g btn-sm" onClick={() => toss(b)}>شيليها</button>
                ) : b.place === "freezer" ? (
                  <button type="button" className="btn btn-s btn-sm" onClick={() => thaw(b)}>طلعيها</button>
                ) : (
                  <button type="button" className="btn btn-p btn-sm" onClick={() => eat(b)}>أكلت علبة</button>
                )}
              </div>
            );
          })}
        </section>
      )}
      {toast.node}
    </>
  );
}
