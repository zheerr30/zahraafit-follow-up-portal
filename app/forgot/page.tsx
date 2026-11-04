"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { Brand } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!isSupabaseConfigured) return setMessage("مفاتيح Supabase مو مضبوطة في Vercel.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMessage("اكتبي إيميلك.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`
    });
    setLoading(false);
    if (error) {
      return setMessage(
        error.status === 429 ? "طلبتي رابط قبل شوي. انتظري دقيقة وجربي مرة ثانية." : "ما قدرنا نرسل الرابط. تأكدي من الإيميل وجربي مرة ثانية."
      );
    }
    setSent(true);
  }

  return (
    <div className="auth gutter">
      <Brand />
      <div className="stack" style={{ gap: 6 }}>
        <h1>نسيتي كلمة المرور؟</h1>
        <p className="muted">اكتبي إيميلك، ونرسل لك رابط تحطين فيه كلمة مرور جديدة.</p>
      </div>
      {sent ? (
        <p className="alert ok" role="status">
          أرسلنا الرابط إلى {email.trim()}. افتحي الإيميل واضغطي الرابط. إذا ما لقيتيه شوفي مجلد الرسائل غير المرغوبة (Spam).
        </p>
      ) : (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">الإيميل</label>
            <input id="email" className="inp" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {message ? <p className="alert err" role="alert">{message}</p> : null}
          <button className="btn btn-p btn-block" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" /> : null}
            أرسلي الرابط
          </button>
        </form>
      )}
      <p className="auth-foot">
        <Link className="link" href="/login">رجوع لتسجيل الدخول</Link>
      </p>
    </div>
  );
}
