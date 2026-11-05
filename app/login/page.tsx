"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Brand, Rings } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { HOME_FOR } from "@/lib/use-auth";
import type { Profile } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function goHome(userId: string) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single<Pick<Profile, "role">>();
    if (profile) router.replace(HOME_FOR[profile.role]);
    return Boolean(profile);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goHome(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!isSupabaseConfigured) {
      setMessage("مفاتيح Supabase مو مضبوطة في Vercel.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setLoading(false);
      setMessage("الإيميل أو كلمة المرور غلط.");
      return;
    }
    const ok = await goHome(data.user.id);
    setLoading(false);
    if (!ok) setMessage("دخلتي، بس ما لقينا ملف حسابك. تواصلي مع المدربة.");
  }

  return (
    <div className="auth gutter">
      <Brand />
      <section className="hero">
        <Rings />
        <span className="label">برنامجك الشخصي</span>
        <h2>خطتك الغذائية والرياضية من المدربة زهراء، في مكان واحد</h2>
      </section>

      <form className="stack" onSubmit={handleSubmit} noValidate>
        <h1>تسجيل الدخول</h1>
        <div className="field">
          <label htmlFor="email">الإيميل</label>
          <input id="email" className="inp" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input id="password" className="inp" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Link className="link" href="/forgot" style={{ alignSelf: "flex-start", minHeight: 36 }}>
            نسيتي كلمة المرور؟
          </Link>
        </div>
        {message ? <p className="alert err" role="alert">{message}</p> : null}
        <button className="btn btn-p btn-block" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" /> : null}
          دخول
        </button>
      </form>

      <p className="auth-foot">
        أول مرة؟ <Link className="link" href="/signup">سوي حسابك</Link>
      </p>
    </div>
  );
}
