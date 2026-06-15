"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserRound, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type AppHeaderProps = {
  profile: Profile;
  title: string;
};

export function AppHeader({ profile, title }: AppHeaderProps) {
  const router = useRouter();
  const isAdmin = profile.role === "admin";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="mb-6 rounded-lg border border-slate-200 bg-white/90 px-4 py-4 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-zahraa-coral">ZahraaFit</p>
          <h1 className="mt-1 text-2xl font-black text-zahraa-navy">{title}</h1>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              <Link className="nav-pill" href="/admin">
                <UserRound size={18} />
                لوحة المدربة
              </Link>
              <Link className="nav-pill" href="/admin/clients">
                <UsersRound size={18} />
                العميلات
              </Link>
            </>
          ) : (
            <>
              <Link className="nav-pill" href="/client/dashboard">
                <UserRound size={18} />
                لوحة العميلة
              </Link>
              <Link className="nav-pill" href="/client/follow-ups">
                <UsersRound size={18} />
                سجل المتابعات
              </Link>
            </>
          )}

          <button className="secondary-button py-2" type="button" onClick={handleLogout}>
            <LogOut size={18} />
            خروج
          </button>
        </nav>
      </div>
    </header>
  );
}
