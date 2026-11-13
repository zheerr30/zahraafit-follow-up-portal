"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dumbbell, Utensils } from "lucide-react";
import { normalizeAnswers } from "@/lib/intake";
import { supabase } from "@/lib/supabase";
import type { Client, PlanRequest, Profile } from "@/lib/types";

/**
 * «جدول جديد» on a subscriber's page: the coach starts a new plan for someone she
 * already has, without a new form. It opens a request (marked «شغالة عليها») with her
 * last answers, so the generator opens filled and the plan is sent from step 2 as usual.
 */
export function NewPlanButtons({ client, profile, lastReq }: { client: Client; profile: Profile | null; lastReq: PlanRequest | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start(kind: "nutrition" | "workout") {
    setBusy(true);
    setErr(null);
    // Her last answers, refreshed with what she has updated since (name, gender, age, height, latest weight).
    const base = normalizeAnswers(lastReq?.answers);
    const { data: w } = await supabase.from("body_logs").select("weight_kg").eq("client_id", client.id).not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle();
    const answers = {
      ...base,
      full_name: profile?.full_name || base.full_name,
      phone: profile?.phone || base.phone,
      gender: (profile?.gender as typeof base.gender) || base.gender,
      age: client.age || base.age,
      height_cm: client.height_cm || base.height_cm,
      weight_kg: w?.weight_kg ? Number(w.weight_kg) : base.weight_kg
    };
    const stamp = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, "");
    const { data, error } = await supabase.from("plan_requests").insert({
      client_id: client.id,
      profile_id: client.profile_id,
      order_number: `تحديث-${stamp}`,
      wants_nutrition: kind === "nutrition",
      wants_workout: kind === "workout",
      wants_followup: false,
      order_verified: true,
      status: "in_progress",
      started_at: new Date().toISOString(),
      answers,
      coach_note: "جدول جديد من المدربة"
    }).select("id").single();
    setBusy(false);
    if (error || !data) return setErr("ما قدرنا نفتح جدول جديد. جربي مرة ثانية.");
    router.push(`/coach/requests/${data.id}`);
  }

  return (
    <section className="card stack">
      <b>جدول جديد لها</b>
      <p className="note" style={{ margin: 0 }}>يفتح المولد بمعلوماتها السابقة (مع آخر وزن سجلته)، تعدلين وترسلين، والجدول القديم يتبدل بالجديد. ما تحتاج تعبي استمارة.</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-s" style={{ flex: 1 }} disabled={busy} onClick={() => start("nutrition")}><Utensils /> جدول غذائي</button>
        <button type="button" className="btn btn-s" style={{ flex: 1 }} disabled={busy} onClick={() => start("workout")}><Dumbbell /> جدول رياضي</button>
      </div>
      {err ? <p className="alert err">{err}</p> : null}
    </section>
  );
}
