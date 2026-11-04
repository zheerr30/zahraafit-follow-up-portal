"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { HOME_FOR } from "@/lib/use-auth";
import type { Profile } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function route() {
      if (!isSupabaseConfigured) return router.replace("/login");
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.replace("/login");
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single<Pick<Profile, "role">>();
      router.replace(profile ? HOME_FOR[profile.role] : "/login");
    }
    route();
  }, [router]);

  return <Loading />;
}
