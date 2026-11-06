"use client";

import { useEffect, type RefObject } from "react";

// The subscriber screens are written addressing a woman. For a male subscriber
// the text on screen is switched to the masculine form with this dictionary,
// so every screen (and the coach's plan text) reads right without writing each
// sentence twice. Shadda (ّ) is removed for everyone.
//
// When you add subscriber text with a new feminine word (a verb ending in ي/ين/تي,
// or an adjective about her), add it here.

export type Gender = "female" | "male";

let current: Gender = "female";
export const setGender = (g: string | null | undefined) => {
  current = g === "male" ? "male" : "female";
};
export const getGender = () => current;

/** Whole phrases first (words that change meaning out of context). */
const PHRASES: [string, string][] = [
  ["وزني نفسك", "وزن نفسك"],
  ["مبتدئة: أول مرة أو راجعة", "مبتدئ: أول مرة أو راجع"],
  ["متوسطة: أتمرن", "متوسط: أتمرن"],
  ["متقدمة: أتمرن", "متقدم: أتمرن"],
  ["بملف مشتركة", "بملف مشترك"],
  ["لمشتركات المتابعة", "لمشتركين المتابعة"],
  ["مشتركات المتابعة", "مشتركين المتابعة"],
  ["خلصتيه اليوم", "خلصته اليوم"]
];

/** Feminine → masculine, single words (with و/ف/ل/ب in front handled too). */
const WORDS: Record<string, string> = {
  // commands
  أبطئي: "أبطئ", أرسلي: "أرسل", أضيفي: "أضف", أعيدي: "أعد", أكملي: "أكمل", أنزلي: "أنزل", أوقفي: "أوقف",
  ابحثي: "ابحث", ابدئي: "ابدأ", احذفي: "احذف", احسبي: "احسب", احسبيها: "احسبها", احفظي: "احفظ", اختاري: "اختر", ادخلي: "ادخل",
  ادفعي: "ادفع", ارجعي: "ارجع", ارفعي: "ارفع", استخدمي: "استخدم", استهدفي: "استهدف", اسمحي: "اسمح", اشتري: "اشتر",
  اشدي: "اشد", اشرحي: "اشرح", اشربي: "اشرب", اضغطي: "اضغط", اطلعي: "اطلع", افتحي: "افتح", اقسمي: "اقسم", اكتبي: "اكتب",
  امسحي: "امسح", انتظري: "انتظر", انزلي: "انزل", انظري: "انظر", تأكدي: "تأكد", التزمي: "التزم", بدلي: "بدل",
  تخطي: "تخط", تمرني: "تمرن", تنفسي: "تنفس", تواصلي: "تواصل", توقفي: "توقف", ثبتي: "ثبت", جاوبي: "جاوب",
  جددي: "جدد", جربي: "جرب", جهزي: "جهز", حافظي: "حافظ", حطي: "حط", خذي: "خذ", راجعي: "راجع", ركزي: "ركز",
  زيدي: "زد", سجلي: "سجل", شدي: "شد", شغلي: "شغل", شغليه: "شغله", شيلي: "شيل", صفري: "صفر", صوري: "صور", ضعي: "ضع", عبي: "عب",
  عدلي: "عدل", علمي: "علم", غيري: "غير", قارني: "قارن", قصري: "قصر", قولي: "قل", قيسي: "قيس", كبري: "كبر", كبريها: "كبرها", صغريها: "صغرها", اسحبي: "اسحب", انسخي: "انسخ", شوفيها: "شوفها", شاركيها: "شاركها",
  كرري: "كرر", كلي: "كل", كملي: "كمل", اشتركي: "اشترك", شاركي: "شارك", أظهري: "أظهر", ارتاحي: "ارتاح", امشي: "امش", اشتغلي: "اشتغل", اسألي: "اسأل", خلي: "خل",
  شوفي: "شوف", روحي: "روح", تعالي: "تعال", نامي: "نم", اهتمي: "اهتم", لاحظي: "لاحظ", صغري: "صغر",
  // commands with "it/me"
  أضيفيه: "أضفه", أضيفيها: "أضفها", احفظيها: "احفظها", ادخريها: "ادخرها", افتحيها: "افتحها", افتحيه: "افتحه",
  اقريه: "اقرأه", اقرئي: "اقرأ", اقري: "اقرأ", اقريها: "اقرأها", اكتبيها: "اكتبها", خذيها: "خذها", خففيه: "خففه", زيديه: "زده", سجليه: "سجله",
  عبيها: "عبها", عدليها: "عدلها", نزليه: "نزله", أديها: "أدها", استخدميه: "استخدمه", طبقيها: "طبقها",
  فعليها: "فعلها", ذكريني: "ذكرني", راسليني: "راسلني", راجعيها: "راجعها", شيليها: "شيلها", جربيها: "جربها", شيليه: "شيله", تحفظينها: "تحفظها", احفظيه: "احفظه", صوريه: "صوره", دوريه: "دوره", اطلبيه: "اطلبه", اطلبي: "اطلب", اطلبيها: "اطلبها",
  // present
  تبين: "تبي", تحسبين: "تحسب", تحبينه: "تحبه", تشاركين: "تشارك", تبدئين: "تبدأ", تبدئي: "تبدأ", تبدلين: "تبدل", تتمرنين: "تتمرن", بتتمرنين: "بتتمرن", بتحسبين: "بتحسب",
  تتابعين: "تتابع", تتأرجحين: "تتأرجح", تتوقفين: "تتوقف", تحبين: "تحب", تحتاجين: "تحتاج", تحطين: "تحط",
  تحفظين: "تحفظ", تختارين: "تختار", تخلصين: "تخلص", تدخلين: "تدخل", تراجعين: "تراجع", ترجعين: "ترجع",
  تزنين: "تزن", تزيدين: "تزيد", تسجلين: "تسجل", تسمحين: "تسمح", تسوين: "تسوي", تشعرين: "تشعر", تشعري: "تشعر",
  تشوفين: "تشوف", بتشوفين: "بتشوف", تطلعين: "تطلع", تعبين: "تعبي", تعدلين: "تعدل", تعرفين: "تعرف", تفضلين: "تفضل",
  تفعلين: "تفعل", تقدرين: "تقدر", تقرئين: "تقرأ", تكملين: "تكمل", تكملي: "تكمل", تعلمين: "تعلم", توصلين: "توصل",
  تتحركي: "تتحرك", تحبسي: "تحبس", تخمني: "تخمن", ترفعي: "ترفع", تستخدمي: "تستخدم", تصلي: "تصل", تنتظري: "تنتظر",
  تاكلين: "تاكل", تاكلينه: "تاكله", تاكلينها: "تاكلها", تبدلينه: "تبدله", تبدلينها: "تبدلها", تحبينها: "تحبها", تحتاجينه: "تحتاجه",
  تحفظينه: "تحفظه", تخلصينه: "تخلصه", ترفعين: "ترفع", ترفعينها: "ترفعها", تشترين: "تشتري", تشترينه: "تشتريه",
  تشوفينه: "تشوفه", تضيفين: "تضيف", تضيفينها: "تضيفها", تعدلينها: "تعدلها", تعرفينه: "تعرفه", تغيرين: "تغير",
  تغيرينه: "تغيره", تغيرينها: "تغيرها", تقولين: "تقول", تقولينه: "تقوله", تلصقيه: "تلصقه", تلقين: "تلقى",
  تلقينه: "تلقاه", تبينها: "تبيها", تبينه: "تبيه", تنامين: "تنام", تمشين: "تمشي", تشربين: "تشرب", تجربين: "تجرب",
  تسجلينها: "تسجلها", تفتحين: "تفتح", تستخدمين: "تستخدم", تصورين: "تصور", تمسحين: "تمسح", تكتبين: "تكتب",
  تعبينها: "تعبيها", تنسين: "تنسى", تتعبين: "تتعب", تجين: "تجي",
  // past
  أكلتي: "أكلت", احتجتي: "احتجت", شاركتي: "شاركت", نزلتي: "نزلت", ضبطتي: "ضبطت", أكلتيه: "أكلته", أكلتيها: "أكلتها", أكملتي: "أكملت", اشتركتي: "اشتركت", اشتريتي: "اشتريت",
  اشتريتيه: "اشتريته", التزمتي: "التزمت", بدلتي: "بدلت", بدلتيها: "بدلتها", جربتي: "جربت", خلصتي: "خلصت",
  خلصتيه: "خلصته", خلصتيها: "خلصتها", رفعتيها: "رفعتها", زدتي: "زدت", سجلتي: "سجلت", سجلتيه: "سجلته",
  سجلتيها: "سجلتها", سجلتيهم: "سجلتهم", سمحتي: "سمحت", طلبتي: "طلبت", طلبتيها: "طلبتها", علمتي: "علمت", علمتيها: "علمتها",
  كملتي: "كملت", لقيتي: "لقيت", لقيتيه: "لقيته", لقيتيها: "لقيتها", نسيتي: "نسيت", وزنتي: "وزنت", وزنتيه: "وزنته",
  وصلتي: "وصلت", أضفتي: "أضفت", سويتي: "سويت", أرسلتي: "أرسلت", فعلتي: "فعلت", شغلتي: "شغلت", بدأتي: "بدأت",
  تمرنتي: "تمرنت", نمتي: "نمت", مشيتي: "مشيت", شربتي: "شربت", جيتي: "جيت", قريتي: "قريت", رحتي: "رحت",
  // about her
  إنتي: "إنت", انتي: "انت", أنتي: "أنت", ملتزمة: "ملتزم", متأكدة: "متأكد", تعبانة: "تعبان", مبتدئة: "مبتدئ",
  مشتركاتنا: "مشتركينا"
};

const AR = "\\u0621-\\u064A";
const WORD_RE = new RegExp(`(^|[^${AR}])(و|ف|ل|ب)?(${Object.keys(WORDS).sort((a, b) => b.length - a.length).join("|")})(?![${AR}])`, "g");

/** The text as this subscriber should see it. */
export function genderText(s: string, g: Gender = current) {
  let out = s.includes("ّ") ? s.replace(/ّ/g, "") : s;
  if (g !== "male" || !/[ء-ي]/.test(out)) return out;
  for (const [a, b] of PHRASES) if (out.includes(a)) out = out.split(a).join(b);
  return out.replace(WORD_RE, (_m, pre: string, p: string | undefined, w: string) => pre + (p || "") + WORDS[w]);
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];

function fixNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const v = node.nodeValue || "";
    const n = genderText(v);
    if (n !== v) node.nodeValue = n;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEXTAREA") return;
  fixAttrs(el);
  el.querySelectorAll("[placeholder],[aria-label],[title],[alt]").forEach(fixAttrs);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const p = t.parentElement;
    if (p && (p.tagName === "TEXTAREA" || p.tagName === "SCRIPT" || p.tagName === "STYLE")) continue;
    const v = t.nodeValue || "";
    const n = genderText(v);
    if (n !== v) t.nodeValue = n;
  }
}

function fixAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const n = genderText(v);
      if (n !== v) el.setAttribute(a, n);
    }
  }
}

/** Keeps the text under `ref` in her (or his) form as the screen changes. */
export function useGenderText(ref: RefObject<HTMLElement | null>, gender: Gender) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    setGender(gender);
    fixNode(root);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") fixNode(m.target);
        else if (m.type === "attributes") fixAttrs(m.target as Element);
        else m.addedNodes.forEach(fixNode);
      }
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => obs.disconnect();
  }, [ref, gender]);
}
