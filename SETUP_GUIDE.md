# ZahraaFit Follow-up Portal Setup Guide

هذا الدليل للمبتدئين، ويشرح تجهيز المشروع من الصفر حتى يصبح جاهزًا للاستخدام الفعلي مع العميلات.

المشروع يستخدم:

- Next.js + TypeScript + Tailwind CSS
- Supabase للتسجيل وقاعدة البيانات ورفع الصور والخطط
- Vercel للنشر

مراجع رسمية مفيدة:

- [Supabase Next.js Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)

## 1. تشغيل المشروع محليًا

افتحي مجلد المشروع في الطرفية ثم شغلي:

```bash
npm install
```

أنشئي ملف البيئة المحلي:

```bash
cp .env.example .env.local
```

بعد إعداد Supabase، ضعي القيم داخل `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=ضع_الرابط_هنا
NEXT_PUBLIC_SUPABASE_ANON_KEY=ضع_المفتاح_هنا
```

شغلي المشروع:

```bash
npm run dev
```

افتحي:

```text
http://localhost:3000/login
```

## 2. إنشاء مشروع Supabase جديد

1. افتحي [Supabase Dashboard](https://supabase.com/dashboard).
2. سجلي الدخول أو أنشئي حسابًا جديدًا.
3. اضغطي `New project`.
4. اختاري المنظمة `Organization`.
5. اكتبي اسم المشروع:

```text
ZahraaFit Follow-up Portal
```

6. اكتبي كلمة مرور قوية لقاعدة البيانات واحفظيها في مكان آمن.
7. اختاري المنطقة الأقرب لمستخدماتك.
8. اضغطي `Create new project`.
9. انتظري حتى يكتمل إنشاء المشروع.

ملاحظة: كلمة مرور قاعدة البيانات ليست كلمة مرور Admin داخل التطبيق. هذه خاصة بإدارة قاعدة البيانات فقط.

## 3. تشغيل schema.sql

ملف schema موجود هنا:

```text
supabase/schema.sql
```

الخطوات:

1. افتحي مشروعك في Supabase.
2. من القائمة الجانبية افتحي `SQL Editor`.
3. اضغطي `New query`.
4. افتحي ملف `supabase/schema.sql` من المشروع.
5. انسخي محتواه كاملًا.
6. الصقيه في Supabase SQL Editor.
7. اضغطي `Run`.
8. انتظري حتى تظهر رسالة نجاح.

بعد التشغيل، تأكدي من وجود الجداول:

```text
profiles
clients
plans
weekly_followups
followup_photos
coach_notes
```

وتأكدي من وجود Buckets:

```text
followup-photos
client-plans
```

## 4. إنشاء Storage Buckets المطلوبة

ملف `schema.sql` ينشئ الـBuckets تلقائيًا. إذا ظهرت لك مشكلة أو أردت إنشائها يدويًا:

1. افتحي Supabase.
2. من القائمة الجانبية افتحي `Storage`.
3. اضغطي `New bucket`.
4. أنشئي bucket باسم:

```text
followup-photos
```

5. اجعليه `Private`.
6. حددي حجم الملف الأقصى إن ظهر الخيار:

```text
10 MB
```

7. حددي الأنواع المسموحة:

```text
image/jpeg
image/png
image/webp
```

8. كرري الخطوات وأنشئي bucket ثاني باسم:

```text
client-plans
```

9. اجعليه `Private`.
10. حددي حجم الملف الأقصى:

```text
20 MB
```

11. حددي الأنواع المسموحة:

```text
application/pdf
image/jpeg
image/png
image/webp
```

مهم: حتى لو أنشأت الـBuckets يدويًا، يجب تشغيل `schema.sql` لأنه يحتوي سياسات Storage RLS.

## 5. الحصول على Environment Variables

المشروع يحتاج قيمتين فقط:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

الخطوات:

1. افتحي مشروع Supabase.
2. افتحي `Project Settings`.
3. افتحي `API` أو `Data API`.
4. انسخي `Project URL`.
5. ضعيه في:

```bash
NEXT_PUBLIC_SUPABASE_URL=
```

6. انسخي المفتاح العام للواجهة.

إذا ظهرت لك صفحة المفاتيح الجديدة في Supabase، استخدمي `Publishable key`.

إذا ظهرت لك صفحة Legacy API Keys، استخدمي `anon public key`.

ضعي القيمة في:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

لا تضعي `service_role` في `.env.local` أو Vercel. هذا المفتاح حساس ولا يجب أن يصل للمتصفح.

## 6. إنشاء حساب Admin بشكل صحيح

الخطوات:

1. افتحي Supabase.
2. افتحي `Authentication`.
3. افتحي `Users`.
4. اضغطي `Add user` أو `Create user`.
5. اكتبي بريد المدربة وكلمة المرور:

```text
zheerr30@gmail.com
```

6. احفظي الحساب.
7. افتحي `SQL Editor`.
8. افتحي ملف:

```text
supabase/admin-setup.sql
```

9. انسخي محتواه كاملًا وشغليه.
10. سجلي الدخول من `/login` باستخدام بريد المدربة.
11. يجب أن يتم تحويلك إلى:

```text
/admin
```

## 7. إنشاء حساب عميلة وربطه بالمدربة

العميلة تستطيع إنشاء حسابها مباشرة من التطبيق.

1. افتحي:

```text
/signup
```

2. أدخلي الاسم الكامل، رقم الجوال، البريد، وكلمة المرور.
3. عند التسجيل يتم إنشاء:

```text
Supabase Auth user
profiles row with role client
clients row linked to the profile
```

4. إذا كان تأكيد البريد غير مفعّل، سيتم تحويل العميلة مباشرة إلى:

```text
/client/dashboard
```

5. إذا كان تأكيد البريد مفعّلًا في Supabase، ستحتاج العميلة فتح رسالة التأكيد ثم تسجيل الدخول.

## 8. نشر المشروع على Vercel

قبل النشر، تأكدي أن المشروع موجود في GitHub.

الخطوات:

1. افتحي [Vercel Dashboard](https://vercel.com/dashboard).
2. اضغطي `Add New`.
3. اختاري `Project`.
4. اربطي حساب GitHub إذا لم يكن مربوطًا.
5. اختاري مستودع المشروع.
6. تأكدي أن Framework هو `Next.js`.
7. في `Environment Variables` أضيفي:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

8. ضعي نفس قيم Supabase التي استخدمتيها محليًا.
9. تأكدي أن Build Command هو:

```bash
npm run build
```

10. اضغطي `Deploy`.
11. بعد انتهاء النشر، افتحي رابط Vercel ثم:

```text
/login
```

12. جرّبي حساب Admin وحساب عميلة.

## 9. صفحة Debug

تمت إضافة صفحة فحص داخل المشروع:

```text
/debug
```

استخدميها بهذا الترتيب:

1. افتحي `/debug` قبل تسجيل الدخول.
2. اضغطي `تشغيل الفحص`.
3. يجب أن يظهر أن الإعداد والاتصال يعملان.
4. إذا طلب تسجيل الدخول، افتحي `/login`.
5. سجلي الدخول كـAdmin.
6. افتحي `/debug` مرة أخرى.
7. اضغطي `تشغيل الفحص`.
8. يجب أن تنجح فحوص Auth وDatabase وStorage.
9. كرري نفس الاختبار بحساب عميلة.

ماذا تفحص الصفحة؟

- وجود متغيرات Supabase.
- الوصول إلى جدول `profiles`.
- وجود جلسة تسجيل دخول.
- دور الحساب: `admin` أو `client`.
- وصول Admin إلى جدول `clients`.
- ربط العميلة بسجل `clients`.
- الوصول إلى buckets:

```text
followup-photos
client-plans
```

## 10. اختبار رفع الصور والخطط

اختبار صور المتابعة:

1. سجلي الدخول كعميلة.
2. افتحي `/client/follow-up/new`.
3. أدخلي الوزن ومحيط الخصر ومحيط الأرداف.
4. ارفعي صورة واحدة على الأقل.
5. احفظي المتابعة.
6. افتحي `/client/follow-ups`.
7. تأكدي أن المتابعة والصورة تظهران.
8. سجلي الدخول كـAdmin.
9. افتحي صفحة العميلة من `/admin/clients`.
10. تأكدي أن الصورة تظهر داخل المتابعة.

اختبار رفع خطة:

1. سجلي الدخول كـAdmin.
2. افتحي `/admin/clients`.
3. افتحي صفحة عميلة.
4. أضيفي عنوان خطة.
5. أضيفي نصًا أو ملف PDF.
6. اضغطي `إضافة كخطة حالية`.
7. سجلي الدخول كعميلة.
8. افتحي `/client/dashboard`.
9. تأكدي أن الخطة تظهر ويمكن فتح الملف.

## 11. مراجعة الصلاحيات RLS

السياسات الحالية مصممة كالتالي:

- العميلة ترى بياناتها فقط.
- العميلة تضيف متابعاتها فقط.
- العميلة ترفع صورًا داخل مجلدها فقط.
- العميلة لا تستطيع كتابة ملاحظات المدربة.
- المدربة ترى كل العميلات.
- المدربة ترى كل المتابعات والصور.
- المدربة تضيف ملاحظات عامة وملاحظات على متابعة.
- المدربة تضيف الخطط وترفع ملفات الخطط.
- Buckets خاصة وليست عامة.
- عرض الصور والخطط يتم عبر signed URLs مؤقتة.

## 12. Checklist الإطلاق النهائي

قبل إعطاء الرابط للعميلات، تأكدي من كل نقطة:

- `schema.sql` اشتغل بدون أخطاء.
- الجداول الستة موجودة.
- `followup-photos` موجود وPrivate.
- `client-plans` موجود وPrivate.
- `.env.local` يحتوي رابط Supabase والمفتاح العام.
- Vercel يحتوي نفس Environment Variables.
- `npm run build` ينجح محليًا.
- `/debug` ينجح بحساب Admin.
- `/debug` ينجح بحساب عميلة.
- حساب Admin يدخل إلى `/admin`.
- حساب العميلة يدخل إلى `/client/dashboard`.
- العميلة لا تستطيع فتح `/admin`.
- Admin لا يتحول إلى لوحة العميلة عند فتح صفحات العميلة.
- العميلة تستطيع حفظ متابعة أسبوعية.
- العميلة تستطيع رفع صورة متابعة.
- العميلة ترى سجل متابعاتها فقط.
- Admin يرى قائمة العميلات.
- Admin يرى تفاصيل كل عميلة.
- Admin يرى صور المتابعة.
- Admin يستطيع كتابة ملاحظة عامة.
- Admin يستطيع كتابة ملاحظة على متابعة.
- Admin يستطيع إضافة خطة نصية.
- Admin يستطيع رفع ملف خطة.
- العميلة ترى الخطة الحالية.
- الرابط المنشور على Vercel يفتح `/login`.
- لا توجد مفاتيح سرية مثل `service_role` في Vercel أو داخل الكود.

## 13. Troubleshooting

إذا فشل تسجيل الدخول:

- تأكدي من أن البريد وكلمة المرور صحيحان.
- تأكدي أن المستخدم موجود في `Authentication > Users`.
- افتحي `/debug` وافحصي Auth.

إذا دخلت العميلة لكن لا تظهر بياناتها:

- تأكدي من وجود سجل في جدول `clients`.
- تأكدي أن `clients.profile_id` يساوي id الخاص بحساب العميلة.

إذا لم تظهر الصور:

- تأكدي أن bucket `followup-photos` موجود وPrivate.
- تأكدي أن `schema.sql` أنشأ سياسات Storage.
- افتحي `/debug` بحساب العميلة وبحساب Admin.

إذا لم تظهر الخطة:

- تأكدي أن Admin أضاف خطة بحالة `is_current = true`.
- تأكدي أن bucket `client-plans` موجود وPrivate.

إذا فشل النشر على Vercel:

- تأكدي أن Environment Variables موجودة في Vercel.
- أعيدي نشر المشروع بعد إضافة المتغيرات.
- تأكدي أن Build Command هو `npm run build`.

## 14. المرحلة الأولى: نموذج معلومات الخطة و"خطط تنتظرك"

هذي الإضافة تنقل نموذج Google Forms للبوابة: المشتركة تعبي معلومات خطتها من حسابها، وتطلع لك في صفحة **خطط تنتظرك**.

### تشغيلها مرة وحدة

1. افتحي Supabase Dashboard ثم `SQL Editor`.
2. اضغطي `New query`.
3. انسخي محتوى الملف كامل والصقيه:

```text
supabase/phase1-plan-requests.sql
```

4. اضغطي `Run`. لازم يطلع `Success`.

الملف ينشئ:

- جدول `plan_requests`: طلب لكل رقم طلب من سلة، فيه إجابات المشتركة وحالة الطلب.
- مخزن ملفات `inbody` خاص: كل مشتركة تشوف ملفاتها بس، وأنتِ تشوفين الكل.
- حساب موعد التسليم: ٣ أيام عمل (الأحد للخميس) من يوم الإرسال.

تشغيله مرة ثانية ما يخرب شي.

### كيف يمشي

- **المشتركة:** تسجل حساب، وتطلع لها في لوحتها بطاقة "عبّي معلومات خطتك". تعبي النموذج على خطوات، وبعدها تشوف إن خطتها بتوصل خلال ٢-٣ أيام عمل، وتقدر تعدل معلوماتها لين تبدئين عليها.
- **أنتِ:** بعد الدخول تفتح لك **خطط تنتظرك** مباشرة، وفيه قسم **المشتركات** لكل الحسابات. الطلبات مرتبة من الأقدم، واللي وصلت ٣ أيام عمل تتلون أحمر.
  - **انسخي معلوماتها للمولّد:** ينسخ معلوماتها كنص جاهز تلصقينه في محادثة المولّد.
  - **الطلب صحيح:** بعد ما تطابقين رقم الطلب مع سلة.
  - **بدأت عليها**، ثم **خلصت وأرسلت الخطة**.

### حماية

- رقم الطلب ينستخدم مرة وحدة بس. لو أحد كتب رقم مستخدم، يطلع له تنبيه.
- المشتركة ما تقدر تغير حالة طلبها ولا تأكيد رقم الطلب، ولا تعدل معلوماتها بعد ما تبدئين عليها.

## 15. الشكل الجديد (ZahraaFit)

المنصة صارت بتصميم جديد على شكل تطبيق جوال، وانشالت صفحات البوابة القديمة:

- المشتركة: `/app` (الرئيسية)، `/app/intake` (معلومات الخطة)، `/app/account` (حسابي).
- المدربة: `/coach` (خطط تنتظرك)، `/coach/subscribers` (المشتركات)، `/coach/requests/...` (تفاصيل كل طلب).
- الروابط القديمة (`/admin` و`/client/...`) تحوّل لحالها للصفحات الجديدة.
- قاعدة البيانات نفسها ما تغيرت، وما يحتاج تشغلين أي ملف جديد.
