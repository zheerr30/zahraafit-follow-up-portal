/**
 * Same formula as the coach's meal generator (generators/meal.html → updateMacros).
 * Keep the two in step if she changes her rules there.
 */
export type CalcGoal = "تخسيس" | "تضخيم" | "صيانة" | "ريكومب";
export type CalcInput = { gender: "female" | "male"; age: number; weight: number; height: number; act: number; goal: CalcGoal };
export type CalcResult = { cal: number; p: number; c: number; f: number; tdee: number; fiber: number; note: string };

export const ACTIVITY: [number, string][] = [
  [1.2, "قليل الحركة"],
  [1.375, "خفيف (1-3 أيام)"],
  [1.55, "متوسط (3-5 أيام)"],
  [1.725, "عالي (6-7 أيام)"],
  [1.9, "رياضية احترافية"]
];

export const CALC_GOALS: [CalcGoal, string][] = [
  ["تخسيس", "🔥 تخسيس"],
  ["ريكومب", "✨ شد وتنسيق (ريكومب)"],
  ["تضخيم", "💪 بناء عضل"],
  ["صيانة", "⚖️ ثبات الوزن"]
];

export function calcMacros({ gender, age, weight: w, height: h, act, goal }: CalcInput): CalcResult | null {
  if (!age || !w || !h) return null;
  const male = gender === "male";
  const bmr = male ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161;
  const tdee = Math.round(bmr * act);
  const HIGH_BF = male ? 20 : 30;
  const bmi = w / Math.pow(h / 100, 2);
  const bfEst = Math.max(8, Math.min(55, 1.2 * bmi + 0.23 * age - 10.8 * (male ? 1 : 0) - 5.4));
  const leanW = w * (1 - bfEst / 100);
  const refW = bfEst > HIGH_BF ? Math.round(leanW * 1.15) : w;

  let calFactor: number, protPerKg: number, fatPerKg: number, note: string;
  if (goal === "تضخيم") {
    calFactor = 1.15; protPerKg = 2.0; fatPerKg = 0.9;
    note = "زيادة ٠.٢٥ إلى ٠.٥٪ من وزنك في الأسبوع";
  } else if (goal === "تخسيس") {
    calFactor = 0.8; protPerKg = male ? 2.5 : 2.3; fatPerKg = 0.7;
    note = "نزول ٠.٥ إلى ١٪ من وزنك في الأسبوع";
  } else if (goal === "ريكومب") {
    calFactor = 1.0; protPerKg = male ? 2.3 : 2.1; fatPerKg = 0.9;
    note = "الوزن ثابت والمقاسات تتغير، قيسي بالشريط والصور مو بالميزان";
  } else {
    calFactor = 1.0; protPerKg = male ? 2.0 : 1.8; fatPerKg = 0.9;
    note = "ثبات الوزن مع تحسن الأداء";
  }

  let delta = Math.round(tdee * (calFactor - 1));
  if (goal === "تضخيم") delta = Math.max(250, Math.min(500, delta));
  if (goal === "تخسيس") delta = -Math.max(300, Math.min(600, Math.abs(delta)));
  const cals = Math.max(male ? 1500 : 1450, tdee + delta);

  let prot = Math.round(refW * protPerKg);
  let fat = Math.round(refW * fatPerKg);
  const minFat = Math.round(refW * 0.5);
  if (fat < minFat) fat = minFat;
  let carb = Math.round((cals - prot * 4 - fat * 9) / 4);

  const CARB_R = goal === "تضخيم" ? [4, 7] : goal === "تخسيس" ? [2, 4] : [3, 5];
  const PROT_R = goal === "تضخيم" ? [1.6, 2.0] : goal === "تخسيس" ? [2.2, 2.8] : [2.0, 2.4];
  const FAT_R = goal === "تخسيس" ? [0.6, 0.8] : [0.8, 1.0];
  const CARB_PCT = goal === "تضخيم" ? 0.55 : goal === "تخسيس" ? 0.42 : 0.47;
  const minCarb = Math.round(refW * CARB_R[0]);
  const maxCarb = Math.min(Math.round(refW * CARB_R[1]), Math.round((cals * CARB_PCT) / 4));
  const maxProt = Math.round(refW * PROT_R[1]);
  const maxFat = Math.round(refW * FAT_R[1]);

  if (carb > maxCarb) {
    let extra = (carb - maxCarb) * 4;
    const addP = Math.min(Math.max(0, maxProt - prot), Math.floor(extra / 4));
    prot += addP;
    extra -= addP * 4;
    const addF = Math.min(Math.max(0, maxFat - fat), Math.floor(extra / 9));
    fat += addF;
    carb = Math.round((cals - prot * 4 - fat * 9) / 4);
  }
  let guard = 0;
  const floorFat = Math.max(minFat, Math.round(refW * FAT_R[0]));
  const floorProt = Math.round(refW * PROT_R[0]);
  while (carb < minCarb && guard < 400) {
    const canFat = fat > floorFat;
    const canProt = prot > floorProt;
    if (!canFat && !canProt) break;
    if (canFat && (!canProt || guard % 2 === 0)) fat--;
    else prot--;
    carb = Math.round((cals - prot * 4 - fat * 9) / 4);
    guard++;
  }
  if (carb < 0) carb = 0;
  const fiber = Math.max(25, Math.min(35, Math.round(cals / 100)));
  return { cal: cals, p: prot, c: carb, f: fat, tdee, fiber, note };
}
