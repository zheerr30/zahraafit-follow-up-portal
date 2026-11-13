"use client";

import { setGender } from "@/lib/gender";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Profile, UserRole } from "@/lib/types";

export const HOME_FOR: Record<UserRole, string> = { admin: "/coach", client: "/app" };

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
};

let userName = "";
/** First name of the signed-in account (for the round initial in the header). */
export const getUserName = () => userName;

/** Loads the signed-in account; sends visitors to /login and the wrong role to its own home. */
export function useAuthGuard(requiredRole?: UserRole) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ loading: true, session: null, profile: null, error: null });

  useEffect(() => {
    let mounted = true;

    async function loadAuth() {
      if (!isSupabaseConfigured) {
        setState({ loading: false, session: null, profile: null, error: "مفاتيح Supabase مو مضبوطة في Vercel." });
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single<Profile>();
      if (!mounted) return;
      if (error || !profile) {
        setState({ loading: false, session, profile: null, error: "ما قدرنا نحمل حسابك. سجلي خروج وادخلي مرة ثانية." });
        return;
      }

      if (requiredRole && profile.role !== requiredRole) {
        router.replace(HOME_FOR[profile.role]);
        return;
      }

      setGender(profile.gender);
      userName = profile.full_name || "";
      setState({ loading: false, session, profile, error: null });
    }

    loadAuth();
    return () => {
      mounted = false;
    };
  }, [requiredRole, router]);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace("/login");
}
