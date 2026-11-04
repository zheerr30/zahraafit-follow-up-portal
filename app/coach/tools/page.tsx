"use client";

import { Dumbbell, MessageSquareText, Utensils } from "lucide-react";
import { CoachShell, Loading } from "@/components/ui";
import { useAuthGuard } from "@/lib/use-auth";

export default function GeneratorsPage() {
  const auth = useAuthGuard("admin");
  if (auth.loading) return <Loading />;
  if (!auth.profile) return null;

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>المولّدات</h1>

      <section className="card stack">
        <div className="row">
          <span className="avatar"><Utensils size={20} /></span>
          <div>
            <b>مولّد الأكل</b>
            <div className="small muted">داخل المنصة. يفتح من صفحة كل طلب بزر «ولّدي الجدول الغذائي»، ومعلومات المشتركة معبّاة.</div>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="row">
          <span className="avatar"><MessageSquareText size={20} /></span>
          <b>تبين تعدلين على المولّد؟</b>
        </div>
        <ol className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
          <li>
            افتحي <b>claude.ai/code</b> وابدئي جلسة جديدة على مستودع <b>zahraafit-follow-up-portal</b>.
          </li>
          <li>اكتبي طلبك زي ما تكتبينه دايم، مثلًا: «ضيف وصفة شكشوكة للفطور» أو «خل السناكات أقل من ٢٠٠ سعرة».</li>
          <li>Claude يعدل المولّد داخل المنصة ويرفعه. بعد دقايق يشتغل التعديل هنا.</li>
        </ol>
        <p className="note">لا تعدلين في المحادثة القديمة. التعديل هناك ما يوصل للمنصة.</p>
      </section>

      <section className="card stack">
        <div className="row">
          <span className="avatar"><Dumbbell size={20} /></span>
          <div>
            <b>مولّد التمارين</b>
            <div className="small muted">الجاي. لين ذاك الوقت انسخي معلوماتها من صفحة الطلب، وارفعي الـPDF.</div>
          </div>
        </div>
      </section>
    </CoachShell>
  );
}
