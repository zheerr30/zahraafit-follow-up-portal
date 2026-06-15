"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { formatDate, formatNumber } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, ClientWithProfile, Profile } from "@/lib/types";

export default function AdminClientsPage() {
  const auth = useAuthGuard("admin");
  const [clients, setClients] = useState<ClientWithProfile[]>([]);
  const [query, setQuery] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadClients() {
      if (!auth.profile) return;

      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (clientsError) {
        setError("تعذر تحميل قائمة العميلات.");
        setLoadingData(false);
        return;
      }

      const baseClients = (clientsData as Client[] | null) || [];
      const profileIds = baseClients.map((client) => client.profile_id);

      if (!profileIds.length) {
        setClients([]);
        setLoadingData(false);
        return;
      }

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", profileIds);

      const profiles = ((profilesData as Profile[] | null) || []).reduce<Record<string, Profile>>(
        (acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        },
        {}
      );

      setClients(baseClients.map((client) => ({ ...client, profile: profiles[client.profile_id] || null })));
      setLoadingData(false);
    }

    loadClients();
  }, [auth.profile]);

  const filteredClients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;

    return clients.filter((client) => {
      const profile = client.profile;
      return [
        profile?.full_name,
        profile?.email,
        profile?.phone,
        client.goal,
        client.status
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [clients, query]);

  if (auth.loading || loadingData) return <LoadingState />;

  if (auth.error) {
    return (
      <main className="page-shell">
        <div className="page-container">
          <ErrorState message={auth.error} />
        </div>
      </main>
    );
  }

  if (!auth.profile) return null;

  return (
    <main className="page-shell">
      <div className="page-container">
        <AppHeader profile={auth.profile} title="قائمة العميلات" />

        <section className="panel p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="section-title">العميلات</h2>
              <p className="muted-text mt-1">اختاري عميلة لمراجعة المتابعات، الصور، الخطة، والملاحظات.</p>
            </div>

            <label className="relative block w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={18} />
              <input
                className="field-input pr-10"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث بالاسم أو البريد أو الهدف"
              />
            </label>
          </div>

          {error ? <ErrorState message={error} /> : null}

          {!error && !filteredClients.length ? (
            <EmptyState
              title="لا توجد عميلات"
              description="بعد إنشاء حسابات العميلات وربطها بجدول clients ستظهر هنا."
            />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredClients.map((client) => (
              <Link
                key={client.id}
                className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-zahraa-coral/50 hover:shadow-soft"
                href={`/admin/clients/${client.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zahraa-mist text-zahraa-coral">
                    <UserRound size={21} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-zahraa-navy">
                      {client.profile?.full_name || "عميلة بدون اسم"}
                    </h3>
                    <p className="mt-1 truncate text-sm text-slate-500">{client.profile?.email || "-"}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <Info label="الهدف" value={client.goal || "-"} />
                  <Info label="وزن البداية" value={formatNumber(client.start_weight, " كجم")} />
                  <Info label="الحالة" value={client.status === "active" ? "نشطة" : "متوقفة"} />
                  <Info label="تاريخ الإضافة" value={formatDate(client.created_at)} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zahraa-mist px-3 py-2">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate font-black text-zahraa-navy">{value}</p>
    </div>
  );
}
