"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, LogIn, Mail, Sparkles } from "lucide-react";
import { ErrorState } from "@/components/Feedback";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function redirectIfLoggedIn() {
      if (!isSupabaseConfigured) return;

      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.session.user.id)
        .single<Profile>();

      if (profile?.role === "admin") router.replace("/admin");
      if (profile?.role === "client") router.replace("/client/dashboard");
    }

    redirectIfLoggedIn();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    if (!isSupabaseConfigured) {
      setLoading(false);
      setMessage("أضيفي مفاتيح Supabase في ملف .env.local ثم أعيدي تشغيل المشروع.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user) {
      setLoading(false);
      setMessage("بيانات الدخول غير صحيحة أو الحساب غير موجود.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single<Profile>();

    setLoading(false);

    if (profileError || !profile) {
      setMessage("تم الدخول، لكن لم يتم العثور على ملف الحساب.");
      return;
    }

    router.replace(profile.role === "admin" ? "/admin" : "/client/dashboard");
  }

  return (
    <main className="page-shell flex items-center justify-center">
      <section className="grid w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/70 bg-white/90 shadow-soft backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
        <div className="dashboard-hero rounded-none p-8 text-white sm:p-10">
          <div className="hero-orb -right-16 top-10 h-52 w-52 bg-zahraa-coral/35" />
          <div className="hero-orb left-8 -top-16 h-56 w-56 bg-white/12" />
          <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/85 backdrop-blur">
            <Sparkles size={15} className="text-zahraa-coral" />
            ZahraaFit Portal
          </div>
          <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            بوابة المتابعة الأسبوعية
          </h1>
          <p className="mt-5 max-w-md text-base leading-8 text-white/78">
            مساحة خاصة للعميلة والمدربة لمتابعة الخطة، القياسات، الصور، وملاحظات
            التحسن بدون أي متجر أو دفع أو أدوات خارج نطاق المتابعة.
          </p>

          <div className="mt-10 grid gap-3 text-sm text-white/86">
            <div className="glass-card flex items-center gap-3 px-4 py-4">
              <CheckCircle2 size={18} className="text-zahraa-coral" />
              دخول العميلة لمراجعة الخطة وتعبئة المتابعة.
            </div>
            <div className="glass-card flex items-center gap-3 px-4 py-4">
              <CheckCircle2 size={18} className="text-zahraa-coral" />
              دخول المدربة لمراجعة العميلات وكتابة الملاحظات.
            </div>
          </div>
          </div>
        </div>

        <div className="p-8 sm:p-12">
          <p className="eyebrow">Welcome back</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-zahraa-navy">تسجيل الدخول</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            استخدمي البريد وكلمة المرور المسجلة في Supabase.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
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

            {message ? <ErrorState message={message} /> : null}

            <button className="primary-button w-full" type="submit" disabled={loading}>
              <LogIn size={18} />
              {loading ? "جاري الدخول..." : "دخول"}
            </button>

            <p className="text-center text-sm text-slate-500">
              ليس لديك حساب؟{" "}
              <Link className="font-black text-zahraa-coral hover:text-zahraa-navy" href="/signup">
                إنشاء حساب جديد
              </Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
