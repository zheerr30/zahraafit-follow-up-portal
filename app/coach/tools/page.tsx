"use client";

import { useEffect, useState } from "react";
import { FileUp, Loader2, Utensils } from "lucide-react";
import { CoachShell, Loading, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { MEAL_GENERATOR_PATH } from "@/lib/generator";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";

export default function GeneratorsPage() {
  const auth = useAuthGuard("admin");
  const toast = useToast();
  const [updated, setUpdated] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase.storage.from("generators").list("", { search: MEAL_GENERATOR_PATH });
    if (err) {
      setError("قاعدة البيانات تحتاج تحديث: شغلي ملف phase3-generators.sql في Supabase.");
      setUpdated(null);
      return;
    }
    const f = (data || []).find((x) => x.name === MEAL_GENERATOR_PATH);
    setUpdated(f ? f.updated_at || f.created_at || "" : null);
  }

  useEffect(() => {
    if (auth.profile) load();
  }, [auth.profile]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.html?$/i.test(file.name)) return setError("اختاري ملف المولّد نفسه، اللي ينتهي بـ .html");
    const text = await file.text();
    if (!/PLANS|generate\(/.test(text)) return setError("الملف هذا ما يبين إنه مولّد الأكل. تأكدي إنك اخترتي الملف الصحيح.");
    setBusy(true);
    const { error: err } = await supabase.storage.from("generators").upload(MEAL_GENERATOR_PATH, new Blob([text], { type: "text/html" }), { upsert: true, contentType: "text/html" });
    setBusy(false);
    if (err) return setError("ما قدرنا نرفع الملف. إذا ما شغلتي ملف phase3-generators.sql في Supabase، شغليه أول.");
    toast.show("رفعنا المولّد. يشتغل من صفحات الطلبات على طول");
    load();
  }

  if (auth.loading || updated === undefined) return <Loading />;
  if (!auth.profile) return null;

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>المولّدات</h1>
      <p className="muted">ارفعي ملف المولّد هنا مرة وحدة. بعدها تفتحينه من صفحة أي طلب، ومعلومات المشتركة معبّاة فيه لحالها.</p>

      <section className="card stack">
        <div className="row">
          <span className="avatar"><Utensils size={20} /></span>
          <div>
            <b>مولّد الأكل</b>
            <div className="small muted">{updated ? `آخر تحديث ${formatDate(updated)}` : "ما رفعتيه للحين"}</div>
          </div>
        </div>
        <label className="file-drop">
          {busy ? <Loader2 className="spin" /> : <FileUp />}
          <span>{updated ? "ارفعي النسخة الجديدة (تحل محل القديمة)" : "اختاري ملف المولّد (.html)"}</span>
          <input type="file" className="sr-only" accept=".html,.htm,text/html" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {error ? <p className="alert err" role="alert">{error}</p> : null}
        <p className="note">
          كل ما تعدلين على المولّد في محادثة Claude، نزّلي الملف الجديد وارفعيه هنا. المنصة تستخدم آخر نسخة رفعتيها.
        </p>
      </section>

      <section className="card stack">
        <b>مفتاح Claude</b>
        <p className="small muted">
          أول مرة تفتحين المولّد هنا، حطي مفتاح Claude في إعداداته زي ما تسوين في المولّد. ينحفظ في هذا المتصفح بس، ويكفي مرة وحدة لكل جهاز.
        </p>
      </section>

      <section className="card stack">
        <b>مولّد التمارين</b>
        <p className="small muted">الجاي: نفس الطريقة لمولّد التمارين. لين ذاك الوقت ارفعي الـPDF حقه زي العادة.</p>
      </section>
      {toast.node}
    </CoachShell>
  );
}
