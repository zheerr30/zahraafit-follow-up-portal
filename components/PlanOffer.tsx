"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const STORE = "https://zahraafit.com";

/** «وجباتي» for someone without a meal plan: what a plan gives, or that hers is on the way. */
export function PlanOffer({ clientId }: { clientId: string }) {
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.from("plan_requests").select("status").eq("client_id", clientId).in("status", ["submitted", "in_progress"]).limit(1)
      .then(({ data }) => setPending(Boolean(data && data.length)));
  }, [clientId]);
  if (pending === null) return null;

  if (pending) {
    return (
      <section className="card stack">
        <b style={{ fontSize: 17 }}>⏳ خطتك عند المدربة</b>
        <p className="small muted">المدربة تجهز خطتك الغذائية، وتوصلك هنا خلال ٢-٣ أيام عمل. لين ذاك الوقت تقدرين تحسبين سعراتك من «🔥 سعراتي».</p>
      </section>
    );
  }

  return (
    <section className="offer">
      <span className="offer-em" aria-hidden="true">🍽️</span>
      <h2>خطة وجبات من المدربة زهراء</h2>
      <p>خطة مكتوبة لك أنتي، على حسب سعراتك وهدفك والأكل اللي تحبينه.</p>
      <ul>
        <li>✅ وجبات يومية بالكميات والسعرات والماكروز</li>
        <li>🔁 بدائل لكل صنف، وتبدلين الوجبة كاملة</li>
        <li>👩‍🍳 طريقة التحضير لكل وجبة</li>
        <li>🍎 سناكات مختارة لك</li>
        <li>🛒 قائمة تسوق جاهزة</li>
        <li>💬 والمدربة تعدلها لك متى ما احتجتي</li>
      </ul>
      <a className="btn btn-p btn-block" href={STORE} target="_blank" rel="noreferrer">اشتركي من المتجر</a>
      <Link className="link" href="/app/intake" style={{ alignSelf: "center" }}>اشتريتي خطة؟ عبي معلوماتك</Link>
    </section>
  );
}
