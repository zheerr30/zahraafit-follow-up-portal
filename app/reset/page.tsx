"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Brand } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { HOME_FOR } from "@/lib/use-auth";
import type { Profile } from "@/lib/types";

export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The email link signs her in for this one step; wait for that session.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) setReady(true);
    });
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 6) return setMessage("كلمة المرور لازم تكون ٦ حروف أو أرقام على الأقل.");
    if (password !== confirm) return setMessage("كلمتين المرور مو نفس بعض.");
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error || !data.user) {
      setLoading(false);
      return setMessage("ما قدرنا نغير كلمة المرور. اطلبي رابط جديد وجربي مرة ثانية.");
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single<Pick<Profile, "role">>();
    setLoading(false);
    router.replace(profile ? HOME_FOR[profile.role] : "/login");
  }

  return (
    <div className="auth gutter">
      <Brand />
      <h1>كلمة مرور جديدة</h1>
      {ready === false ? (
        <>
          <p className="alert err">الرابط انتهى أو انستخدم قبل. اطلبي رابط جديد.</p>
          <Link className="btn btn-p btn-block" href="/forgot">اطلبي رابط جديد</Link>
        </>
      ) : (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="password">كلمة المرور الجديدة</label>
            <input id="password" className="inp" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="confirm">اكتبيها مرة ثانية</label>
            <input id="confirm" className="inp" type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {message ? <p className="alert err" role="alert">{message}</p> : null}
          <button className="btn btn-p btn-block" type="submit" disabled={loading || ready !== true}>
            {loading || ready === null ? <Loader2 className="spin" /> : null}
            احفظي كلمة المرور
          </button>
        </form>
      )}
    </div>
  );
}
