"use client";

import { useEffect, useRef } from "react";
import { Bookmark, Dumbbell, Utensils } from "lucide-react";
import { CoachShell, Loading } from "@/components/ui";
import { MEAL_BOOKMARKLET, WORKOUT_BOOKMARKLET } from "@/lib/bookmarklets";
import { useAuthGuard } from "@/lib/use-auth";

/** React refuses javascript: links, so the href is set after mount. */
function BookmarkButton({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={ref}
      className="btn btn-p"
      style={{ cursor: "grab" }}
      draggable
      onClick={(e) => {
        e.preventDefault();
        alert("لا تضغطين الزر هنا. اسحبيه بالماوس لشريط المفضلة فوق.");
      }}
    >
      {icon}
      {label}
    </a>
  );
}

export default function ToolsPage() {
  const auth = useAuthGuard("admin");
  if (auth.loading) return <Loading />;
  if (!auth.profile) return null;

  return (
    <CoachShell>
      <h1 style={{ fontSize: 24 }}>أزرار التصدير</h1>
      <p className="muted">
        زرين تحطينهم في شريط المفضلة في Chrome مرة وحدة. كل زر يقرأ الجدول من المولّد وينزل لك ملف بيانات صغير، ترفعينه للمشتركة مع الـPDF، فتصير خطتها تفاعلية في التطبيق. الأزرار ما تغير في المولّدين شي.
      </p>

      <section className="card stack">
        <h2 style={{ fontSize: 17 }}>١. ركّبي الزرين (مرة وحدة بس)</h2>
        <ol className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
          <li>
            إذا شريط المفضلة مو ظاهر في Chrome: اضغطي <b>Cmd + Shift + B</b> (أو <b>Ctrl + Shift + B</b> في الويندوز).
          </li>
          <li>
            <b>اسحبي</b> كل زر من تحت بالماوس، وأفلتيه فوق في شريط المفضلة.
          </li>
        </ol>
        <div className="row wrap">
          <BookmarkButton href={MEAL_BOOKMARKLET} label="تصدير الغذائي" icon={<Utensils />} />
          <BookmarkButton href={WORKOUT_BOOKMARKLET} label="تصدير الرياضي" icon={<Dumbbell />} />
        </div>
        <p className="note">
          <Bookmark size={14} style={{ verticalAlign: "-2px" }} /> إذا الجوال ما يسمح بالسحب، ركبيهم من الكمبيوتر. المولّدين أصلًا تشتغلين عليهم من الكمبيوتر.
        </p>
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 17 }}>٢. كل مرة تسوين خطة</h2>
        <ol className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
          <li>ولّدي الجدول في المولّد زي العادة، واحفظيه PDF زي العادة.</li>
          <li>
            وأنتِ في صفحة المولّد، اضغطي زر <b>تصدير الغذائي</b> (أو <b>تصدير الرياضي</b>) في شريط المفضلة.
          </li>
          <li>في مولّد الأكل تطلع لك قائمة آخر الجداول. اختاري جدول المشتركة، وينزل الملف.</li>
          <li>
            في صفحة طلب المشتركة، الخطوة ٢، ارفعي <b>الـPDF وملف البيانات</b> مع بعض، وأرسلي.
          </li>
        </ol>
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 17 }}>إذا الزر ما اشتغل</h2>
        <p className="small muted">
          إذا طلع لك «ما لقيت جدول»، تأكدي إنك ولّدتي الجدول في نفس الصفحة قبل ما تضغطين. وإذا يوم من الأيام تعديل على المولّد غيّر طريقة حفظ الجداول، الزر بيوقف. الـPDF يوصل للمشتركة عادي، وأرسلي لي آخر نسخة من المولّد وأعدل الزر.
        </p>
      </section>
    </CoachShell>
  );
}
