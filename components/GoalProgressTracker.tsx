import { ArrowDownRight, ArrowRight, ArrowUpRight, Target } from "lucide-react";
import { calculateGoalProgress, directionLabel, trendClasses } from "@/lib/progress";
import { formatNumber } from "@/lib/format";
import type { Client, WeeklyFollowup } from "@/lib/types";

export function GoalProgressTracker({
  client,
  followups
}: {
  client: Client;
  followups: WeeklyFollowup[];
}) {
  const progress = calculateGoalProgress(client, followups);
  const percent = progress.progressPercent ?? 0;
  const TrendIcon =
    progress.arrow === "↑" ? ArrowUpRight : progress.arrow === "↓" ? ArrowDownRight : ArrowRight;

  return (
    <section className="panel overflow-hidden reveal-card">
      <div className="relative overflow-hidden bg-zahraa-navy px-6 py-6 text-white">
        <div className="hero-orb -right-10 top-4 h-32 w-32 bg-zahraa-coral/30" />
        <div className="hero-orb -left-16 -top-16 h-36 w-36 bg-white/15" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Goal Progress</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">التقدم نحو الهدف</h2>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 shadow-sm ring-1 ring-white/15">
            <Target size={23} />
          </div>
        </div>
      </div>

      <div className="p-6">
        {progress.progressPercent === null ? (
          <div className="rounded-[26px] border border-dashed border-slate-300 bg-zahraa-mist p-6 text-center">
            <p className="font-black text-zahraa-navy">أضيفي الوزن المستهدف لبدء تتبع التقدم</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              ستظهر النسبة والشريط بعد تحديد وزن البداية والوزن المستهدف ووجود متابعة وزن.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black text-slate-500">{directionLabel(progress.direction)}</p>
                <p className="mt-1 text-5xl font-black tracking-tight text-zahraa-navy">{percent}%</p>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black ${trendClasses(progress.trend)}`}>
                <TrendIcon size={18} />
                {progress.trendLabel}
              </div>
            </div>

            <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  background: "linear-gradient(90deg, #F26539 0%, #ffb199 100%)"
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-black text-slate-400">
              <span>البداية</span>
              <span>الهدف</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="وزن البداية" value={formatNumber(progress.startWeight, " كجم")} />
              <Metric label="الوزن الحالي" value={formatNumber(progress.currentWeight, " كجم")} highlight />
              <Metric label="الوزن المستهدف" value={formatNumber(progress.targetWeight, " كجم")} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-[22px] bg-zahraa-navy px-4 py-4 text-white shadow-soft"
          : "rounded-[22px] bg-zahraa-mist px-4 py-4"
      }
    >
      <p className={highlight ? "text-xs font-black text-white/65" : "text-xs font-black text-slate-500"}>{label}</p>
      <p className={highlight ? "mt-1 text-xl font-black text-white" : "mt-1 text-xl font-black text-zahraa-navy"}>{value}</p>
    </div>
  );
}
