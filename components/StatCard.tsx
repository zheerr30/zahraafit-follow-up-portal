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
    <div className="metric-tile reveal-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-500">{label}</p>
        {icon ? <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zahraa-coral/10 text-zahraa-coral shadow-sm">{icon}</div> : null}
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-zahraa-navy">{value}</p>
    </div>
  );
}
