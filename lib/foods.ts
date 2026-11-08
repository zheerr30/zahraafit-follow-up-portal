/** A food from the coach's generator list, values per 100 g. */
export type BaseFood = { n: string; cat: string; cal: number; p: number; c: number; f: number; note: string; piece?: { label: string; g: number }; /** fiber, sodium, potassium, sugar per 100 g (lib/micro-data.ts) */ m?: { fib: number | null; na: number | null; k: number | null; sug: number | null } };

/** A food added by hand (hers, or a ready dish from the coach). */
export type CustomFood = { id: string; owner_id: string | null; name: string; basis: "100g" | "serving"; serving_label: string | null; serving_g?: number | null; cal: number; p: number; c: number; f: number };

/** A product found by barcode (values per 100 g). */
export type BarcodeProduct = { barcode: string; name: string; brand: string | null; cal: number; p: number; c: number; f: number; serving_g: number | null; serving_label: string | null; source: string };

export type FoodEntry = { id: string; client_id: string; log_date: string; slot: Slot; name: string; amount: number; unit: string; cal: number; p: number; c: number; f: number; created_at: string; fiber?: number | null; sodium?: number | null; potassium?: number | null; sugar?: number | null };

export const SLOTS = ["فطور", "غداء", "عشاء", "سناك"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_EMOJI: Record<Slot, string> = { فطور: "🌅", غداء: "☀️", عشاء: "🌙", سناك: "🍎" };

/** One thing she can pick in the search. Values are per 100 g ("100g") or per serving. */
export type Pickable = {
  key: string;
  name: string;
  src: "base" | "mine" | "coach" | "barcode";
  basis: "100g" | "serving";
  cal: number;
  p: number;
  c: number;
  f: number;
  hint: string;
  /** Ways to measure it. g = grams per one of this unit (for "100g" foods); for servings g is 1. */
  units: { label: string; g: number }[];
  /** Fiber, sodium, potassium, sugar on the same basis as cal (only the food list has them). */
  m?: BaseFood["m"];
};

export function fromBase(x: BaseFood): Pickable {
  const units = [{ label: "جرام", g: 1 }];
  if (x.piece) units.unshift({ label: x.piece.label, g: x.piece.g });
  return { key: `b:${x.n}`, name: x.n, src: "base", basis: "100g", cal: x.cal, p: x.p, c: x.c, f: x.f, hint: [x.cat, x.note].filter(Boolean).join(" · "), units, m: x.m };
}

export function fromCustom(x: CustomFood): Pickable {
  const serving = x.basis === "serving";
  return {
    key: `c:${x.id}`,
    name: x.name,
    src: x.owner_id ? "mine" : "coach",
    basis: x.basis,
    cal: Number(x.cal),
    p: Number(x.p),
    c: Number(x.c),
    f: Number(x.f),
    hint: x.owner_id ? "أكلاتي" : "من المدربة",
    units: serving
      ? [{ label: x.serving_label || "حصة", g: 1 }]
      : x.serving_g
        ? [{ label: x.serving_label || "حصة", g: Number(x.serving_g) }, { label: "جرام", g: 1 }]
        : [{ label: "جرام", g: 1 }]
  };
}

export function fromBarcode(x: BarcodeProduct): Pickable {
  const units = [{ label: "جرام", g: 1 }];
  if (x.serving_g) units.unshift({ label: x.serving_label || "حصة", g: Number(x.serving_g) });
  return { key: `bc:${x.barcode}`, name: x.brand ? `${x.name} · ${x.brand}` : x.name, src: "barcode", basis: "100g", cal: Number(x.cal), p: Number(x.p), c: Number(x.c), f: Number(x.f), hint: "📷 من الباركود", units };
}

/** Values for an amount of a food. */
export function scaled(food: Pickable, amount: number, unit: { label: string; g: number }) {
  const factor = food.basis === "100g" ? (amount * unit.g) / 100 : amount;
  const r = (v: number) => Math.round(v * factor * 10) / 10;
  const mv = (v: number | null | undefined) => (v === null || v === undefined ? null : r(v));
  return {
    cal: Math.round(food.cal * factor), p: r(food.p), c: r(food.c), f: r(food.f),
    ...(food.m ? { fiber: mv(food.m.fib), sodium: mv(food.m.na), potassium: mv(food.m.k), sugar: mv(food.m.sug) } : {})
  };
}

/** Arabic-friendly matching: no diacritics, أ/إ/آ = ا, ة = ه, ى = ي. */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function search(list: Pickable[], q: string, limit = 40) {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored: { x: Pickable; s: number }[] = [];
  for (const x of list) {
    const n = norm(x.name);
    if (!words.every((w) => n.includes(w))) continue;
    // Whole-word starts first ("بيض" before "أبيض"), then her own foods, then shorter names.
    const tokens = n.split(" ");
    const inWord = words.filter((w) => !tokens.some((t) => t.startsWith(w))).length;
    const s = (n.startsWith(words[0]) ? 0 : 1) + inWord * 3 + (x.src === "base" ? 0.5 : 0) + n.length / 100;
    scored.push({ x, s });
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((v) => v.x);
}

export function defaultSlot(): Slot {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date()));
  if (h < 11) return "فطور";
  if (h < 16) return "غداء";
  if (h < 19) return "سناك";
  return "عشاء";
}
