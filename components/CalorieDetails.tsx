"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useDayMicros, type DayMicros } from "@/lib/micros";
import type { Meal } from "@/lib/plan-data";

const KEY = "zf-cal-details";

/** «تفاصيل أكثر» under the macros: fiber, sodium, potassium, sugar. Remembers open/closed. */
export function CalorieDetails({ d, male }: { d: DayMicros | null; male: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(KEY) === "1"); } catch {}
  }, []);
  const toggle = () => {
    const v = !open;
    setOpen(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
  };
  const kGoal = male ? 3400 : 2600;
  const bar = (v: number, goal: number, color: string) => (
    <i aria-hidden="true" className="cd-bar"><i style={{ width: `${Math.min(100, (v / goal) * 100)}%`, background: color }} /></i>
  );

  return (
    <div className="cal-details">
      <button type="button" className="cd-toggle" aria-expanded={open} onClick={toggle}>
        تفاصيل أكثر <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        d ? (
          <div className="cd-body">
            <div className="cd-row">
              <span>الألياف</span>
              <b className="num">{Math.round(d.fib)} غ <small>من 25-35 غ</small></b>
              {bar(d.fib, 25, "#F2A27F")}
            </div>
            <div className="cd-row">
              <span>الصوديوم</span>
              <b className="num" style={{ color: d.na > 2300 ? "#E8602C" : undefined }}>{Math.round(d.na).toLocaleString("en-US")} ملغ <small>حد أعلى 2,300 ملغ</small></b>
              {bar(d.na, 2300, d.na > 2300 ? "#E8602C" : "#8FA0C4")}
            </div>
            <div className="cd-row">
              <span>البوتاسيوم</span>
              <b className="num">{Math.round(d.k).toLocaleString("en-US")} ملغ <small>من {kGoal.toLocaleString("en-US")} ملغ</small></b>
              {bar(d.k, kGoal, "#8FA0C4")}
            </div>
            <div className="cd-row">
              <span>السكر</span>
              <b className="num">{Math.round(d.sug)} غ</b>
              <small className="cd-note">السكر الكلي، يشمل الفاكهة والحليب</small>
            </div>
            {d.missing ? <small className="cd-note">{d.missing === 1 ? "صنف واحد" : d.missing === 2 ? "صنفين" : `${d.missing} أصناف`} بدون بيانات كاملة، الأرقام من الباقي.</small> : null}
          </div>
        ) : <small className="cd-note">لحظة...</small>
      ) : null}
    </div>
  );
}

/** Loads the day's values (logged food + ticked plan meals) and shows «تفاصيل أكثر». */
export function DayDetails({ clientId, date, meals, male, refresh = 0 }: { clientId: string; date: string; meals: Pick<Meal, "ingredients">[]; male: boolean; refresh?: number }) {
  const d = useDayMicros(clientId, date, meals, refresh);
  return <CalorieDetails d={d} male={male} />;
}
