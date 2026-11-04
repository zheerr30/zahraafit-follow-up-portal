import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { BaseFood } from "@/lib/foods";
import { extractFoods } from "@/lib/food-list";

// The food list for the diary comes straight from the coach's meal generator
// (DEFAULT_INGR in generators/meal.html, values per 100 g), so it always
// matches her plans. Any signed-in user can read it.

export const dynamic = "force-dynamic";

let cache: { mtime: number; foods: BaseFood[] } | null = null;

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return new Response("Unauthorized", { status: 401 });

  const file = path.join(process.cwd(), "generators", "meal.html");
  const html = await readFile(file, "utf8");
  if (!cache || cache.mtime !== html.length) cache = { mtime: html.length, foods: extractFoods(html) };
  return Response.json(cache.foods, { headers: { "cache-control": "private, max-age=3600" } });
}
