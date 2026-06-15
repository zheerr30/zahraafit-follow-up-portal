import type { Client, WeeklyFollowup } from "@/lib/types";

export type GoalDirection = "loss" | "gain" | "maintain" | "unknown";
export type TrendStatus = "good" | "steady" | "bad" | "neutral";

export type GoalProgress = {
  direction: GoalDirection;
  trend: TrendStatus;
  progressPercent: number | null;
  startWeight: number | null;
  currentWeight: number | null;
  targetWeight: number | null;
  weightDelta: number | null;
  trendLabel: string;
  arrow: string;
};

const stableThreshold = 0.2;

function latestWeightedFollowups(followups: WeeklyFollowup[]) {
  return [...followups]
    .filter((followup) => followup.weight_kg !== null)
    .sort((a, b) => {
      const weekDiff = new Date(b.week_date).getTime() - new Date(a.week_date).getTime();
      if (weekDiff !== 0) return weekDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

export function getGoalDirection(client: Client): GoalDirection {
  if (client.start_weight == null || client.target_weight == null) return "unknown";
  if (client.target_weight < client.start_weight) return "loss";
  if (client.target_weight > client.start_weight) return "gain";
  return "maintain";
}

export function calculateGoalProgress(client: Client, followups: WeeklyFollowup[]): GoalProgress {
  const weightedFollowups = latestWeightedFollowups(followups);
  const currentWeight = weightedFollowups[0]?.weight_kg ?? client.start_weight;
  const previousWeight = weightedFollowups[1]?.weight_kg ?? null;
  const direction = getGoalDirection(client);
  const startWeight = client.start_weight;
  const targetWeight = client.target_weight;
  const weightDelta =
    currentWeight !== null && previousWeight !== null ? Number((currentWeight - previousWeight).toFixed(2)) : null;

  let progressPercent: number | null = null;

  if (startWeight != null && targetWeight != null && currentWeight != null && startWeight !== targetWeight) {
    const totalChange = Math.abs(targetWeight - startWeight);
    const currentChange =
      direction === "loss" ? startWeight - currentWeight : currentWeight - startWeight;
    progressPercent = Math.max(0, Math.min(100, Math.round((currentChange / totalChange) * 100)));
  }

  let trend: TrendStatus = "neutral";
  let trendLabel = "بانتظار متابعة أخرى";
  let arrow = "→";

  if (weightDelta !== null) {
    const isSteady = Math.abs(weightDelta) <= stableThreshold;
    if (isSteady) {
      trend = "steady";
      trendLabel = "آخر تغيير: ثبات";
      arrow = "→";
    } else if (direction === "loss") {
      trend = weightDelta < 0 ? "good" : "bad";
      trendLabel = weightDelta < 0 ? "آخر تغيير: نزول مناسب" : "آخر تغيير: زيادة تحتاج انتباه";
      arrow = weightDelta < 0 ? "↓" : "↑";
    } else if (direction === "gain") {
      trend = weightDelta > 0 ? "good" : "bad";
      trendLabel = weightDelta > 0 ? "آخر تغيير: زيادة مناسبة" : "آخر تغيير: نزول يحتاج انتباه";
      arrow = weightDelta > 0 ? "↑" : "↓";
    }
  } else if (currentWeight !== null && startWeight !== null) {
    if (direction === "loss" && currentWeight < startWeight - stableThreshold) {
      trend = "good";
      trendLabel = "تقدم نحو الهدف";
      arrow = "↓";
    } else if (direction === "gain" && currentWeight > startWeight + stableThreshold) {
      trend = "good";
      trendLabel = "تقدم نحو الهدف";
      arrow = "↑";
    } else if (direction !== "unknown") {
      trend = "steady";
      trendLabel = "بانتظار تغيير أوضح";
      arrow = "→";
    }
  }

  return {
    direction,
    trend,
    progressPercent,
    startWeight,
    currentWeight,
    targetWeight,
    weightDelta,
    trendLabel,
    arrow
  };
}

export function trendClasses(trend: TrendStatus) {
  if (trend === "good") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (trend === "steady") return "bg-amber-50 text-amber-700 border-amber-200";
  if (trend === "bad") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function directionLabel(direction: GoalDirection) {
  if (direction === "loss") return "هدف نزول وزن";
  if (direction === "gain") return "هدف زيادة وزن";
  if (direction === "maintain") return "هدف تثبيت وزن";
  return "لم يتم تحديد الهدف الرقمي";
}
