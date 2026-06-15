import { ArrowDownRight, ArrowRight, ArrowUpRight, Target } from "lucide-react";
import { directionLabel, calculateGoalProgress, trendClasses } from "@/lib/progress";
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
    <section className="panel overflow-hidden">
      <div className="bg-zahraa-navy px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-zahraa-coral">Goal Progress</p>
            <h2 className="mt-1 text-xl font-black">التقدم نحو الهدف</h2>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
            <Target size={22} />
          </div>
        </div>
      </div>

      <div className="p-5">
        {progress.progressPercent === null ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-zahraa-mist p-5 text-center">
            <p className="font-black text-zahraa-navy">أضيفي الوزن المستهدف لبدء تتبع التقدم</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              ستظهر النسبة والشريط بعد تحديد وزن البداية والوزن المستهدف ووجود متابعة وزن.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500">{directionLabel(progress.direction)}</p>
                <p className="mt-1 text-4xl font-black text-zahraa-navy">{percent}%</p>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black ${trendClasses(progress.trend)}`}>
                <TrendIcon size={18} />
                {progress.trendLabel}
              </div>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-zahraa-coral transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="وزن البداية" value={formatNumber(progress.startWeight, " كجم")} />
              <Metric label="الوزن الحالي" value={formatNumber(progress.currentWeight, " كجم")} />
              <Metric label="الوزن المستهدف" value={formatNumber(progress.targetWeight, " كجم")} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zahraa-mist px-4 py-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-zahraa-navy">{value}</p>
    </div>
  );
}
