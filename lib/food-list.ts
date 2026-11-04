import type { BaseFood } from "@/lib/foods";

/** Reads DEFAULT_INGR (values per 100 g) out of the coach's generator HTML. Server only. */
export function extractFoods(html: string): BaseFood[] {
  const start = html.indexOf("const DEFAULT_INGR=[");
  if (start < 0) return [];
  let i = start + "const DEFAULT_INGR=".length;
  const from = i;
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) break;
  }
  // Her own file, a plain array of object literals.
  const raw = new Function(`return ${html.slice(from, i + 1)}`)() as { name: string; cat?: string; cal: number; prot: number; carb: number; fat: number; note?: string }[];
  return raw
    .filter((x) => x && x.name && typeof x.cal === "number" && x.note !== "لا تحسب")
    .map((x) => {
      const m = (x.note || "").match(/^(حبة|شريحة|وجه|ملعقة|كوب|سكوب|رغيف)\s*≈\s*(\d+(?:\.\d+)?)\s*g/);
      return {
        n: x.name,
        cat: x.cat || "",
        cal: x.cal,
        p: x.prot || 0,
        c: x.carb || 0,
        f: x.fat || 0,
        note: x.note && !m ? x.note : "",
        piece: m ? { label: m[1], g: Number(m[2]) } : undefined
      };
    });
}
