// Intake form: the questions from the Google Form, as structured answers the
// coach and the generators can read without guessing.

export type Gender = "female" | "male";
export type Goal = "lose" | "shape" | "muscle";
export type TrainingPlace = "gym" | "home_weights" | "bodyweight";
export type Level = "beginner" | "intermediate" | "advanced";

export type IntakeAnswers = {
  full_name: string;
  phone: string;
  age: number | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: Goal | null;
  goal_details: string;
  health: string[];
  health_notes: string;
  nutrition: {
    excluded: string[];
    dislikes: string;
    meals_per_day: number | null;
    notes: string;
  };
  workout: {
    days: number | null;
    place: TrainingPlace | null;
    level: Level | null;
    injuries: string[];
    notes: string;
  };
  source: string;
  comments: string;
  consent: boolean;
};

export const emptyAnswers = (): IntakeAnswers => ({
  full_name: "",
  phone: "",
  age: null,
  gender: null,
  height_cm: null,
  weight_kg: null,
  goal: null,
  goal_details: "",
  health: [],
  health_notes: "",
  nutrition: { excluded: [], dislikes: "", meals_per_day: null, notes: "" },
  workout: { days: null, place: null, level: null, injuries: [], notes: "" },
  source: "",
  comments: "",
  consent: false
});

/** Fill any fields an older saved answer set is missing. */
export function normalizeAnswers(raw: unknown): IntakeAnswers {
  const base = emptyAnswers();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<IntakeAnswers>;
  return {
    ...base,
    ...r,
    health: Array.isArray(r.health) ? r.health : [],
    nutrition: { ...base.nutrition, ...(r.nutrition || {}) },
    workout: { ...base.workout, ...(r.workout || {}) }
  };
}

export const GENDERS: Record<Gender, string> = { female: "أنثى", male: "ذكر" };

export const GOALS: Record<Goal, string> = {
  lose: "خسارة الوزن",
  shape: "تحسين شكل الجسم وتنسيق القوام",
  muscle: "بناء عضلات"
};

export const PLACES: Record<TrainingPlace, string> = {
  gym: "النادي",
  home_weights: "أثقال منزلية",
  bodyweight: "وزن الجسم"
};

export const LEVELS: Record<Level, string> = {
  beginner: "مبتدئة: أول مرة أو راجعة بعد انقطاع",
  intermediate: "متوسطة: أتمرن من ٦ شهور تقريبًا",
  advanced: "متقدمة: أتمرن بانتظام من أكثر من سنة"
};

export const LEVEL_SHORT: Record<Level, string> = {
  beginner: "مبتدئة",
  intermediate: "متوسطة",
  advanced: "متقدمة"
};

// Same keys the meal generator uses for its exclusion dictionary.
export const EXCLUDED_OPTIONS = [
  "ألبان ولاكتوز",
  "جلوتين",
  "مكسرات",
  "بيض",
  "سمك",
  "بحريات",
  "لحوم حمراء",
  "صويا",
  "بقوليات"
];

export const HEALTH_OPTIONS = [
  "تكيسات المبايض",
  "مقاومة إنسولين",
  "سكري",
  "خمول الغدة",
  "فقر دم أو نقص حديد",
  "ارتجاع المريء",
  "القولون",
  "ضغط الدم",
  "حامل",
  "مرضعة",
  "عملية سمنة"
];

export const INJURY_OPTIONS = ["الركبة", "أسفل الظهر", "الكتف", "الرقبة", "الرسغ", "الكاحل"];

export const SOURCE_OPTIONS = ["تويتر", "انستقرام", "تيك توك", "سناب شات", "صديق أو قريب", "مشترك سابق", "أخرى"];

export function planTypeLabel(r: { wants_nutrition: boolean; wants_workout: boolean; wants_followup: boolean }) {
  const parts: string[] = [];
  if (r.wants_nutrition && r.wants_workout) parts.push("غذائي ورياضي");
  else if (r.wants_nutrition) parts.push("غذائي");
  else if (r.wants_workout) parts.push("رياضي");
  if (r.wants_followup) parts.push("متابعة");
  return parts.join(" + ");
}

/** Accepts Arabic-Indic digits, "166 cm", "59,7" and similar. Returns null if not a number. */
export function parseNumber(input: string): number | null {
  const ascii = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٫,]/g, ".")
    .replace(/[^\d.]/g, "");
  if (!ascii) return null;
  const n = Number.parseFloat(ascii);
  return Number.isFinite(n) ? n : null;
}

const line = (label: string, value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? null : `${label}: ${value}`;

/**
 * Plain text the coach copies into the generator conversation. Same order as
 * the old Google Form so the generator reads it the way it always has.
 */
export function answersToGeneratorText(
  a: IntakeAnswers,
  r: { wants_nutrition: boolean; wants_workout: boolean; wants_followup: boolean; order_number: string }
) {
  const rows: (string | null)[] = [
    line("الاسم", a.full_name),
    line("الجوال", a.phone),
    line("نوع الاشتراك", planTypeLabel(r)),
    line("رقم الطلب", r.order_number),
    line("العمر", a.age),
    line("الجنس", a.gender ? GENDERS[a.gender] : null),
    line("الطول (سم)", a.height_cm),
    line("الوزن (كجم)", a.weight_kg),
    line("الهدف", a.goal ? GOALS[a.goal] : null),
    line("تفاصيل الهدف", a.goal_details),
    line("الحالة الصحية", a.health.length ? a.health.join("، ") : "لا يوجد"),
    line("تفاصيل صحية", a.health_notes)
  ];
  if (r.wants_nutrition) {
    rows.push(
      "",
      "— الخطة الغذائية —",
      line("مستبعد (حساسية أو ما تاكله)", a.nutrition.excluded.length ? a.nutrition.excluded.join("، ") : "لا يوجد"),
      line("أصناف ما تحبها", a.nutrition.dislikes),
      line("عدد الوجبات المفضل", a.nutrition.meals_per_day),
      line("ملاحظات الأكل", a.nutrition.notes)
    );
  }
  if (r.wants_workout) {
    rows.push(
      "",
      "— الخطة الرياضية —",
      line("أيام التمرين", a.workout.days),
      line("مكان التمرين", a.workout.place ? PLACES[a.workout.place] : null),
      line("المستوى", a.workout.level ? LEVEL_SHORT[a.workout.level] : null),
      line("إصابات أو آلام", a.workout.injuries.length ? a.workout.injuries.join("، ") : "لا يوجد"),
      line("ملاحظات التمرين", a.workout.notes)
    );
  }
  rows.push("", line("تعليقات إضافية", a.comments));
  return rows.filter((x) => x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
