"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Profile, UserRole } from "@/lib/types";

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
};

export function useAuthGuard(requiredRole?: UserRole) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    profile: null,
    error: null
  });

  useEffect(() => {
    let mounted = true;

    async function loadAuth() {
      if (!isSupabaseConfigured) {
        setState({
          loading: false,
          session: null,
          profile: null,
          error: "لم يتم إعداد مفاتيح Supabase بعد."
        });
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single<Profile>();

      if (error || !profile) {
        if (!mounted) return;
        setState({
          loading: false,
          session,
          profile: null,
          error: "تعذر تحميل بيانات الحساب."
        });
        return;
      }

      if (requiredRole && profile.role !== requiredRole) {
        router.replace(profile.role === "admin" ? "/admin" : "/client/dashboard");
        return;
      }

      if (!mounted) return;
      setState({ loading: false, session, profile, error: null });
    }

    loadAuth();

    return () => {
      mounted = false;
    };
  }, [requiredRole, router]);

  return state;
}
