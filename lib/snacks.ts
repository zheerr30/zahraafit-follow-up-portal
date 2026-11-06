import type { Pickable } from "@/lib/foods";

/**
 * General snacks for people without a plan from the coach, built from the
 * generator's own ingredients (values per 100 g), so numbers match her plans.
 */
export const GENERAL_SNACKS: { name: string; items: [string, number][] }[] = [
  { name: "زبادي يوناني بالتوت والعسل", items: [["زبادي يوناني", 170], ["توت أزرق", 50], ["عسل", 7]] },
  { name: "تفاحة مع زبدة فول سوداني", items: [["تفاح", 180], ["زبدة فول سوداني", 15]] },
  { name: "٣ تمرات مع كوب حليب", items: [["تمر", 24], ["حليب قليل الدسم", 200]] },
  { name: "بيضتين مسلوقة مع خيار", items: [["بيض", 100], ["خيار", 100]] },
  { name: "حفنة لوز", items: [["لوز", 20]] },
  { name: "موزة", items: [["موز", 120]] },
  { name: "جبن قريش مع خيار وجزر", items: [["جبن قريش", 100], ["خيار", 60], ["جزر", 60]] },
  { name: "توست أسمر بلبنة وخيار", items: [["خبز توست أسمر", 30], ["لبنة", 30], ["خيار", 50]] },
  { name: "حليب بروتين", items: [["حليب بروتين", 330]] },
  { name: "فشار بدون زبدة", items: [["فشار", 25]] },
  { name: "شوكولاتة داكنة مع فراولة", items: [["شوكولاتة داكنة", 20], ["فراولة", 100]] },
  { name: "كوب لبن", items: [["لبن رايب", 250]] },
  { name: "حمص مع جزر", items: [["حمص مطبوخ", 80], ["جزر", 80]] },
  { name: "صحن بطيخ", items: [["بطيخ", 300]] }
];

export type Snack = { name: string; detail: string; cal: number; p: number; c: number; f: number };

/** Works out each general snack from the base foods; skips any whose ingredient is missing. */
export function generalSnacks(base: Pickable[]): Snack[] {
  const by = new Map(base.filter((x) => x.src === "base").map((x) => [x.name, x]));
  const out: Snack[] = [];
  for (const s of GENERAL_SNACKS) {
    let cal = 0, p = 0, c = 0, f = 0;
    let ok = true;
    for (const [n, g] of s.items) {
      const b = by.get(n);
      if (!b) { ok = false; break; }
      const k = g / 100;
      cal += b.cal * k; p += b.p * k; c += b.c * k; f += b.f * k;
    }
    if (!ok) continue;
    const r = (v: number) => Math.round(v * 10) / 10;
    out.push({ name: s.name, detail: s.items.map(([n, g]) => `${n} ${g}جم`).join("، "), cal: Math.round(cal), p: r(p), c: r(c), f: r(f) });
  }
  return out;
}
