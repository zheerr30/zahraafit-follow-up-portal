"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { Brand } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function ensureClientRecord(userId: string) {
    const { data: existing } = await supabase.from("clients").select("id").eq("profile_id", userId).maybeSingle();
    if (existing) return true;
    const { error } = await supabase.from("clients").insert({ profile_id: userId, status: "active" });
    return !error || error.code === "23505";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSuccess(null);
    if (!isSupabaseConfigured) return setMessage("مفاتيح Supabase مو مضبوطة في Vercel.");
    if (!fullName.trim()) return setMessage("اكتبي اسمك.");
    if (phone.replace(/[^\d٠-٩]/g, "").length < 9) return setMessage("اكتبي رقم جوالك.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMessage("اكتبي إيميل صحيح.");
    if (password.length < 6) return setMessage("كلمة المرور لازم تكون ٦ حروف أو أرقام على الأقل.");

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim(), signup_source: "client_signup" } }
    });

    if (error || !data.user) {
      setLoading(false);
      setMessage(error?.message?.includes("registered") ? "هذا الإيميل مسجل من قبل. سجلي دخول بدلًا من ذلك." : "ما قدرنا نسوي الحساب. تأكدي من المعلومات وجربي مرة ثانية.");
      return;
    }

    if (!data.session) {
      setLoading(false);
      setSuccess("سوينا حسابك. افتحي رسالة التأكيد اللي وصلت إيميلك، وبعدها سجلي دخول.");
      return;
    }

    const ready = await ensureClientRecord(data.user.id);
    setLoading(false);
    if (!ready) return setMessage("سوينا الحساب بس ما اكتمل ربطه. تواصلي مع المدربة.");
    router.replace("/app");
  }

  return (
    <div className="auth gutter">
      <Brand />
      <div className="stack" style={{ gap: 6 }}>
        <h1>هلا فيك! سوي حسابك</h1>
        <p className="muted">من حسابك تعبين معلومات خطتك، وتوصلك خطتك وتتابعين تقدمك.</p>
      </div>

      {success ? (
        <p className="alert ok" role="status">{success}</p>
      ) : (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">الاسم</label>
            <input id="name" className="inp" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone">رقم الجوال</label>
            <input id="phone" className="inp" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <span className="note">نفس الرقم اللي اشتريتي فيه من المتجر.</span>
          </div>
          <div className="field">
            <label htmlFor="email">الإيميل</label>
            <input id="email" className="inp" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" className="inp" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {message ? <p className="alert err" role="alert">{message}</p> : null}
          <button className="btn btn-p btn-block" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" /> : null}
            سوي حسابي
          </button>
        </form>
      )}

      <p className="auth-foot">
        عندك حساب؟ <Link className="link" href="/login">سجلي دخول</Link>
      </p>
    </div>
  );
}
