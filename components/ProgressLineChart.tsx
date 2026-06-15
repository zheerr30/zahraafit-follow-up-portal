import { Activity } from "lucide-react";
import { EmptyState } from "@/components/Feedback";
import { formatDate } from "@/lib/format";
import type { WeeklyFollowup } from "@/lib/types";

type SeriesKey = "weight_kg" | "waist_cm" | "hips_cm";

const series: { key: SeriesKey; label: string; color: string }[] = [
  { key: "weight_kg", label: "الوزن", color: "#0B2E6B" },
  { key: "waist_cm", label: "الخصر", color: "#F26539" },
  { key: "hips_cm", label: "الأرداف", color: "#10B981" }
];

export function ProgressLineChart({ followups }: { followups: WeeklyFollowup[] }) {
  const points = [...followups]
    .filter((followup) => followup.weight_kg !== null || followup.waist_cm !== null || followup.hips_cm !== null)
    .sort((a, b) => new Date(a.week_date).getTime() - new Date(b.week_date).getTime());

  if (points.length < 2) {
    return (
      <section className="panel p-5">
        <SectionHeader />
        <div className="mt-4">
          <EmptyState
            title="لا توجد بيانات كافية للشارت"
            description="سيظهر خط التقدم بعد إدخال متابعتين أسبوعيتين على الأقل."
          />
        </div>
      </section>
    );
  }

  const values = points.flatMap((point) =>
    series.map((item) => point[item.key]).filter((value): value is number => value !== null)
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 720;
  const height = 260;
  const padding = 34;

  function x(index: number) {
    return padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  }

  function y(value: number) {
    return height - padding - ((value - min) / range) * (height - padding * 2);
  }

  function pathFor(key: SeriesKey) {
    let segmentIndex = 0;
    return points
      .map((point, index) => {
        const value = point[key];
        if (value === null) return null;
        const command = segmentIndex === 0 ? "M" : "L";
        segmentIndex += 1;
        return `${command} ${x(index)} ${y(value)}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  return (
    <section className="panel p-5">
      <SectionHeader />
      <div className="mt-5 overflow-hidden rounded-lg border border-slate-100 bg-white">
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="شارت التقدم">
          <rect width={width} height={height} fill="#FFFFFF" />
          {[0, 1, 2, 3].map((line) => {
            const yLine = padding + line * ((height - padding * 2) / 3);
            return <line key={line} x1={padding} x2={width - padding} y1={yLine} y2={yLine} stroke="#E2E8F0" strokeDasharray="5 7" />;
          })}
          {series.map((item) => (
            <path key={item.key} d={pathFor(item.key)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {points.map((point, index) =>
            series.map((item) => {
              const value = point[item.key];
              if (value === null) return null;
              return <circle key={`${point.id}-${item.key}`} cx={x(index)} cy={y(value)} r="4.5" fill={item.color} stroke="#FFFFFF" strokeWidth="2" />;
            })
          )}
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2 rounded-full bg-zahraa-mist px-3 py-1 text-xs font-black text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-400">
        من {formatDate(points[0]?.week_date)} إلى {formatDate(points[points.length - 1]?.week_date)}
      </p>
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-zahraa-coral">Progress Chart</p>
        <h2 className="section-title mt-1">تغير القياسات عبر المتابعات</h2>
      </div>
      <Activity className="text-zahraa-coral" size={22} />
    </div>
  );
}
