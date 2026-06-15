# ZahraaFit Follow-up Portal

بوابة MVP عربية RTL للمتابعة الأسبوعية بين المدربة والعميلة.

النطاق الحالي فقط:

- تسجيل دخول
- لوحة العميلة
- نموذج متابعة أسبوعية
- سجل المتابعات والصور
- لوحة المدربة
- قائمة العميلات
- تفاصيل عميلة واحدة
- ملاحظات المدربة
- إضافة أو رفع خطة العميلة

لا يحتوي المشروع على متجر، دفع، حاسبة سعرات، ذكاء اصطناعي، إشعارات، أو تصدير PDF.

## التشغيل محليًا

للدليل الكامل خطوة بخطوة، افتحي:

```text
SETUP_GUIDE.md
```

ولمراجعة الجاهزية قبل الإطلاق:

```text
LAUNCH_REVIEW.md
```

1. ثبتي الاعتمادات:

```bash
npm install
```

2. أنشئي ملف البيئة:

```bash
cp .env.example .env.local
```

3. أضيفي قيم Supabase داخل `.env.local`.

4. شغلي المشروع:

```bash
npm run dev
```

5. افتحي:

```bash
http://localhost:3000/login
```

## Environment Variables

المتغيرات المطلوبة بالضبط:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

لا يحتاج التطبيق إلى `SERVICE_ROLE_KEY` داخل الواجهة أو Vercel.

## إعداد Supabase

1. أنشئي مشروع Supabase جديد.
2. افتحي `SQL Editor`.
3. انسخي محتوى `supabase/schema.sql` وشغليه كاملًا.
4. تأكدي من وجود الجداول:

```text
profiles
clients
plans
weekly_followups
followup_photos
coach_notes
```

5. تأكدي من وجود Storage buckets:

```text
followup-photos
client-plans
```

6. من `Project Settings > API` انسخي:

```text
Project URL
anon public key
```

7. ضعيها في `.env.local` محليًا وفي Vercel لاحقًا.

## إنشاء حساب Admin

1. من Supabase افتحي `Authentication > Users`.
2. أنشئي مستخدمة جديدة للمدربة بالبريد وكلمة المرور.
3. بعد إنشاء المستخدم، شغلي هذا الاستعلام في `SQL Editor` مع تغيير البريد:

```sql
update public.profiles
set role = 'admin',
    full_name = 'ZahraaFit Coach'
where email = 'coach@example.com';
```

## ربط عميلة بحسابها

1. أنشئي حساب العميلة من `Authentication > Users`.
2. بعد إنشاء الحساب، اربطيه بجدول العميلات:

```sql
insert into public.clients (
  profile_id,
  coach_id,
  age,
  height_cm,
  goal,
  start_weight,
  status
)
select
  client_profile.id,
  coach_profile.id,
  28,
  165,
  'تحسين اللياقة وخفض الوزن',
  72,
  'active'
from public.profiles client_profile
cross join public.profiles coach_profile
where client_profile.email = 'client@example.com'
  and coach_profile.email = 'coach@example.com';
```

## النشر على Vercel

1. ارفعي المشروع إلى GitHub.
2. من Vercel اختاري `New Project`.
3. اختاري المستودع.
4. اتركي Framework كـ `Next.js`.
5. أضيفي Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

6. Build Command:

```bash
npm run build
```

7. بعد النشر، افتحي رابط Vercel على `/login`.

## أوامر التحقق

```bash
npm run build
npm audit --omit=dev
```

بعد إعداد Supabase، افتحي صفحة الفحص:

```text
/debug
```

تم ضبط المشروع على `next build --webpack` لأن Next 16 يستخدم Turbopack افتراضيًا، وWebpack أكثر استقرارًا لهذا الـMVP ومع بيئات النشر العادية.

## ملاحظات الاختبار

- نجح `npm run build` بدون أخطاء.
- نجح `npm audit --omit=dev` بدون ثغرات بعد إضافة override آمن لـ PostCSS داخل Next.
- تم فتح صفحة `/login` على خادم الإنتاج المحلي والتأكد من أن الواجهة عربية و`rtl`.
- اختبار تسجيل الدخول الحقيقي، صلاحيات العميلة، صلاحيات المدربة، حفظ المتابعة، رفع الصور، إضافة الملاحظات، ورفع الخطة يحتاج مشروع Supabase فعليًا مع المتغيرات مضافة وتشغيل `supabase/schema.sql`.

## خطأ بيئي ظهر أثناء التنفيذ

في بيئة Codex المحلية فقط، فشل تحميل SWC native بسبب قيود توقيع macOS داخل التطبيق، ثم عمل البناء باستخدام حزمة WASM:

```text
@next/swc-wasm-nodejs
```

كما ظهر خطأ `EMFILE: too many open files` عند تشغيل خادم التطوير على المنفذ 3000 في البيئة نفسها. تم التحقق بدلًا من ذلك عبر خادم الإنتاج المحلي على منفذ آخر، ونجح.
