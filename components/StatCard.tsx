import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        {icon ? <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zahraa-coral/10 text-zahraa-coral">{icon}</div> : null}
      </div>
      <p className="mt-3 text-2xl font-black text-zahraa-navy">{value}</p>
    </div>
  );
}
