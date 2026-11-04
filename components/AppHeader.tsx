"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Inbox, LogOut, UserRound, UsersRound } from "lucide-react";
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
    <header className="mb-6 rounded-[28px] border border-white/70 bg-white/85 px-4 py-4 shadow-soft backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zahraa-navy text-white shadow-soft">
            <Dumbbell size={22} />
          </div>
          <div>
            <p className="eyebrow">ZahraaFit</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-zahraa-navy">{title}</h1>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              <Link className="nav-pill" href="/admin">
                <UserRound size={18} />
                لوحة المدربة
              </Link>
              <Link className="nav-pill" href="/admin/requests">
                <Inbox size={18} />
                خطط تنتظرك
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

          <button className="secondary-button px-4 py-2" type="button" onClick={handleLogout}>
            <LogOut size={18} />
            خروج
          </button>
        </nav>
      </div>
    </header>
  );
}
