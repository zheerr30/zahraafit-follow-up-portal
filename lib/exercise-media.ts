// Animations and Arabic how-to for the generator's exercises (by EX id).
// Animations: Vital Animations (vitalanimations.com), commercial license; files in
// public/exercises/<file>.mp4 (+ .jpg thumbnail), compressed for phones.
// Text: translated from their exercise data, reviewed by the coach.

export type ExerciseMedia = {
  /** file name in public/exercises without extension */
  file: string;
  /** female model version, when there is one */
  fileFemale?: string;
  desc: string;
  steps: string[];
};

export const EXERCISE_MEDIA: Record<string, ExerciseMedia> = {
  squat: {
    file: "0054",
    desc: "السكوات بالبار هو التمرين الأساسي للجزء السفلي. البار على أعلى ظهرك، ويشغل الفخذ الأمامي بالأساس مع المؤخرة والفخذ الخلفي، ويبني القوة والعضل.",
    steps: [
      "حطي البار على أعلى ظهرك (عضلة الترابيس)، وارجعي خطوة من الحامل، ورجليك بعرض كتفك.",
      "وجهي أصابع رجلك لبرا شوي، وخلي صدرك مرفوع وبطنك مشدود.",
      "انزلي بثني ركبتك ودفع وركك لورا، لين يصير فخذك موازي للأرض.",
      "ادفعي من كعبك وافردي ركبتك ووركك لين ترجعين واقفة.",
      "كرري العدد المطلوب."
    ]
  },
  hipthrustbb: {
    file: "0057",
    desc: "الهيب ثرست بالبار من أقوى تمارين المؤخرة. ظهرك العلوي على مقعد والبار على حوضك، وتقدرين ترفعين فيه أوزان عالية بمدى حركة كامل.",
    steps: [
      "اجلسي على الأرض وظهرك العلوي مسنود على مقعد، والبار فوق حوضك وعليه وسادة.",
      "حطي رجليك على الأرض بعرض الحوض، وركبتك مثنية.",
      "ادفعي من كعبك وارفعي حوضك لين يصير جسمك خط مستقيم من الركبة للكتف.",
      "اعصري المؤخرة فوق.",
      "نزلي حوضك بتحكم، وكرري العدد المطلوب."
    ]
  },
  lateral: {
    file: "0096",
    desc: "الرفرفة الجانبية أهم تمرين عزل للكتف الجانبي. ترفعين يدينك للجنب، وتوسع الكتف وتعطيه الشكل الدائري.",
    steps: [
      "قفي معتدلة وامسكي دمبل بكل يد جنبك، وكف يدك لجسمك.",
      "خلي كوعك مثني شوي وبطنك مشدود.",
      "ارفعي الدمبلين للجنب بقوس واسع لين توصل يدك موازية للأرض.",
      "اثبتي ثانية فوق، وحسي بالكتف الجانبي يشتغل.",
      "نزلي ببطء لنقطة البداية، وكرري العدد المطلوب."
    ]
  }
};

export const mediaFor = (id: string) => EXERCISE_MEDIA[id] || null;
export const mediaSrc = (m: ExerciseMedia, female: boolean) => `/exercises/${female && m.fileFemale ? m.fileFemale : m.file}`;
