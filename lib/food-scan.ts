"use client";

import { shrinkPhoto } from "@/lib/followup";
import type { BarcodeProduct } from "@/lib/foods";
import { supabase } from "@/lib/supabase";

/** Our shared list first, then Open Food Facts (saved to our list when found). */
export async function lookupBarcode(code: string, profileId: string): Promise<BarcodeProduct | null> {
  const { data } = await supabase.from("barcode_products").select("*").eq("barcode", code).maybeSingle();
  if (data) return data as BarcodeProduct;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ar,product_name_en,brands,nutriments,serving_quantity,serving_size`);
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: number; product?: { product_name?: string; product_name_ar?: string; product_name_en?: string; brands?: string; serving_quantity?: number | string; nutriments?: Record<string, number | string> } };
    const pr = j.product;
    const n = pr?.nutriments || {};
    const num = (k: string) => (n[k] === undefined || n[k] === "" ? null : Number(n[k]));
    const kcal = num("energy-kcal_100g") ?? (num("energy_100g") !== null ? Math.round(num("energy_100g")! / 4.184) : null);
    const name = (pr?.product_name_ar || pr?.product_name || pr?.product_name_en || "").trim();
    if (j.status !== 1 || !pr || kcal === null || !name) return null;
    const sq = Number(pr.serving_quantity);
    const row: BarcodeProduct = {
      barcode: code,
      name: name.slice(0, 160),
      brand: (pr.brands || "").split(",")[0].trim().slice(0, 120) || null,
      cal: Math.min(1000, Math.max(0, Math.round(kcal))),
      p: Math.min(100, Math.max(0, Math.round((num("proteins_100g") || 0) * 10) / 10)),
      c: Math.min(100, Math.max(0, Math.round((num("carbohydrates_100g") || 0) * 10) / 10)),
      f: Math.min(100, Math.max(0, Math.round((num("fat_100g") || 0) * 10) / 10)),
      serving_g: sq > 0 && sq <= 2000 ? Math.round(sq * 10) / 10 : null,
      serving_label: sq > 0 ? "حصة" : null,
      source: "off"
    };
    await supabase.from("barcode_products").insert({ ...row, added_by: profileId });
    return row;
  } catch {
    return null;
  }
}

const AI_ERRORS: Record<string, string> = {
  not_configured: "قراءة الصور بالذكاء الاصطناعي لسا ما تفعلت. المدربة بتفعلها قريب.",
  limit: "وصلتي حدك اليوم من قراءة الصور. جربي بكرا أو اكتبيها بنفسك.",
  refused: "ما قدرنا نقرأ هالصورة. جربي صورة ثانية.",
  busy: "الخدمة مشغولة الحين، جربي بعد دقيقة.",
  bad_image: "الصورة ما وصلت صح. جربي مرة ثانية."
};

/** Sends a photo to /api/ai/{kind}. Returns the parsed answer or an Arabic error. */
export async function aiRead<T>(kind: "label" | "meal", file: File): Promise<{ data?: T; error?: string }> {
  try {
    const blob = await shrinkPhoto(file);
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch(`/api/ai/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${s.session?.access_token || ""}` },
      body: JSON.stringify({ image: b64 })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { error: AI_ERRORS[(j as { error?: string }).error || ""] || "ما قدرنا نقرأ الصورة. جربي مرة ثانية." };
    return { data: j as T };
  } catch {
    return { error: "ما قدرنا نقرأ الصورة. تأكدي من الاتصال وجربي مرة ثانية." };
  }
}
