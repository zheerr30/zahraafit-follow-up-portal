import { Activity } from "lucide-react";
import { EmptyState } from "@/components/Feedback";
import { formatDate } from "@/lib/format";
import type { WeeklyFollowup } from "@/lib/types";

type SeriesKey = "weight_kg" | "waist_cm" | "hips_cm";

type SeriesItem = {
  key: SeriesKey;
  label: string;
  color: string;
  unit: string;
};

const weightSeries: SeriesItem[] = [
  { key: "weight_kg", label: "الوزن", color: "#0B2E6B", unit: "كجم" }
];

const measurementSeries: SeriesItem[] = [
  { key: "waist_cm", label: "الخصر", color: "#F26539", unit: "سم" },
  { key: "hips_cm", label: "الأرداف", color: "#10B981", unit: "سم" }
];

function sortFollowups(followups: WeeklyFollowup[]) {
  return [...followups]
    .filter((followup) => followup.weight_kg !== null || followup.waist_cm !== null || followup.hips_cm !== null)
    .sort((a, b) => {
      const weekDiff = new Date(a.week_date).getTime() - new Date(b.week_date).getTime();
      if (weekDiff !== 0) return weekDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

export function ProgressLineChart({ followups }: { followups: WeeklyFollowup[] }) {
  const points = sortFollowups(followups);

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

  return (
    <section className="panel p-5">
      <SectionHeader />
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <MiniChart
          title="تغير الوزن"
          description="مقياس مستقل حتى يظهر فرق الوزن بوضوح."
          points={points}
          series={weightSeries}
        />
        <MiniChart
          title="تغير القياسات"
          description="الخصر والأرداف على مقياس منفصل عن الوزن."
          points={points}
          series={measurementSeries}
        />
      </div>
    </section>
  );
}

function MiniChart({
  title,
  description,
  points,
  series
}: {
  title: string;
  description: string;
  points: WeeklyFollowup[];
  series: SeriesItem[];
}) {
  const chartPoints = points.filter((point) => series.some((item) => point[item.key] !== null));

  if (chartPoints.length < 2) {
    return (
      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <h3 className="text-base font-black text-zahraa-navy">{title}</h3>
        <div className="mt-3">
          <EmptyState
            title="بيانات غير كافية"
            description="أضيفي قيمتين على الأقل لهذا النوع من القياس."
          />
        </div>
      </div>
    );
  }

  const values = chartPoints.flatMap((point) =>
    series.map((item) => point[item.key]).filter((value): value is number => value !== null)
  );
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const safeRange = rawMax - rawMin || 1;
  const min = rawMin - safeRange * 0.15;
  const max = rawMax + safeRange * 0.15;
  const range = max - min || 1;
  const width = 680;
  const height = 240;
  const padding = 34;

  function x(index: number) {
    return padding + (index / Math.max(chartPoints.length - 1, 1)) * (width - padding * 2);
  }

  function y(value: number) {
    return height - padding - ((value - min) / range) * (height - padding * 2);
  }

  function pathFor(key: SeriesKey) {
    let segmentIndex = 0;
    return chartPoints
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
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-black text-zahraa-navy">{title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-400">{description}</p>
        </div>
        <p className="text-xs font-bold text-slate-400">
          من {formatDate(chartPoints[0]?.week_date)} إلى {formatDate(chartPoints[chartPoints.length - 1]?.week_date)}
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-100 bg-white">
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <rect width={width} height={height} fill="#FFFFFF" />
          {[0, 1, 2, 3].map((line) => {
            const yLine = padding + line * ((height - padding * 2) / 3);
            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={yLine}
                y2={yLine}
                stroke="#E2E8F0"
                strokeDasharray="5 7"
              />
            );
          })}
          {series.map((item) => (
            <path
              key={item.key}
              d={pathFor(item.key)}
              fill="none"
              stroke={item.color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {chartPoints.map((point, index) =>
            series.map((item) => {
              const value = point[item.key];
              if (value === null) return null;
              return (
                <g key={`${point.id}-${item.key}`}>
                  <circle cx={x(index)} cy={y(value)} r="4.5" fill={item.color} stroke="#FFFFFF" strokeWidth="2" />
                  <text
                    x={x(index)}
                    y={y(value) - 10}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-bold"
                  >
                    {value}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2 rounded-full bg-zahraa-mist px-3 py-1 text-xs font-black text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label} ({item.unit})
          </span>
        ))}
      </div>
    </div>
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
