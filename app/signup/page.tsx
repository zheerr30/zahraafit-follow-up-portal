"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Phone, UserRound, UserPlus } from "lucide-react";
import { ErrorState } from "@/components/Feedback";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function ensureClientRecord(userId: string) {
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingClient) return true;

    const { error } = await supabase.from("clients").insert({
      profile_id: userId,
      status: "active"
    });

    return !error || error.code === "23505";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);
    setLoading(true);

    if (!isSupabaseConfigured) {
      setLoading(false);
      setMessage("أضيفي مفاتيح Supabase في ملف .env.local ثم أعيدي تشغيل المشروع.");
      return;
    }

    if (password.length < 6) {
      setLoading(false);
      setMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }

    if (password !== confirmPassword) {
      setLoading(false);
      setMessage("كلمة المرور وتأكيدها غير متطابقين.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          signup_source: "client_signup"
        }
      }
    });

    if (error || !data.user) {
      setLoading(false);
      setMessage(error?.message || "تعذر إنشاء الحساب. تأكدي من البيانات وحاولي مرة أخرى.");
      return;
    }

    if (!data.session) {
      setLoading(false);
      setSuccess(
        "تم إنشاء الحساب. إذا كان تأكيد البريد مفعّلًا في Supabase، افتحي رسالة التأكيد ثم سجلي الدخول."
      );
      return;
    }

    const clientReady = await ensureClientRecord(data.user.id);
    setLoading(false);

    if (!clientReady) {
      setMessage("تم إنشاء الحساب، لكن تعذر إنشاء ملف العميلة. تواصلي مع المدربة لإكمال الربط.");
      return;
    }

    router.replace("/client/dashboard");
  }

  return (
    <main className="page-shell flex items-center justify-center">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-zahraa-navy p-8 text-white sm:p-10">
          <p className="text-sm font-bold text-zahraa-coral">ZahraaFit</p>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
            إنشاء حساب عميلة
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/80">
            أنشئي حسابك للوصول إلى خطتك، تعبئة المتابعة الأسبوعية، ومراجعة ملاحظات المدربة.
          </p>

          <Link className="secondary-button mt-8 border-white/20 bg-white/10 text-white hover:bg-white/15" href="/login">
            لدي حساب بالفعل
          </Link>
        </div>

        <div className="p-8 sm:p-10">
          <h2 className="text-2xl font-black text-zahraa-navy">بيانات الحساب</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            استخدمي بريدًا صحيحًا وكلمة مرور آمنة.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="field-label">الاسم الكامل</span>
              <span className="relative block">
                <UserRound className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={18} />
                <input
                  className="field-input pr-10"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="مثال: سارة أحمد"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="field-label">رقم الجوال</span>
              <span className="relative block">
                <Phone className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={18} />
                <input
                  className="field-input pr-10"
                  dir="ltr"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+9665XXXXXXXX"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="field-label">البريد الإلكتروني</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={18} />
                <input
                  className="field-input pr-10"
                  dir="ltr"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="field-label">كلمة المرور</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={18} />
                  <input
                    className="field-input pr-10"
                    dir="ltr"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="field-label">تأكيد كلمة المرور</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={18} />
                  <input
                    className="field-input pr-10"
                    dir="ltr"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </span>
              </label>
            </div>

            {message ? <ErrorState message={message} /> : null}
            {success ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold leading-7 text-emerald-800">
                {success}
              </div>
            ) : null}

            <button className="primary-button w-full" type="submit" disabled={loading}>
              <UserPlus size={18} />
              {loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
