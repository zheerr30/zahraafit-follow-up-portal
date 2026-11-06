import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Recipe library for meal prep (free accounts): RECIPES from the coach's meal
// generator (generators/meal.html), trimmed to what the app needs.

export const dynamic = "force-dynamic";

type Recipe = { id: number; name: string; type: string; cal: number; p: number; c: number; f: number; ing: { n: string; a: number | string; u: string }[]; prep: string };
let cache: { size: number; list: Recipe[] } | null = null;

function extract(html: string): Recipe[] {
  const start = html.indexOf("const RECIPES=[");
  if (start < 0) return [];
  let i = start + "const RECIPES=".length;
  const from = i;
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) break;
  }
  // Her own file, a plain array of object literals.
  const raw = new Function(`return ${html.slice(from, i + 1)}`)() as Recipe[];
  return raw
    .filter((r) => r && r.name && Array.isArray(r.ing) && r.ing.length)
    .map((r) => ({ id: r.id, name: r.name, type: r.type || "", cal: Math.round(r.cal), p: r.p, c: r.c, f: r.f, ing: r.ing.map((x) => ({ n: x.n, a: x.a, u: x.u || "" })), prep: r.prep || "" }));
}

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return new Response("Unauthorized", { status: 401 });
  const html = await readFile(path.join(process.cwd(), "generators", "meal.html"), "utf8");
  if (!cache || cache.size !== html.length) cache = { size: html.length, list: extract(html) };
  return Response.json(cache.list, { headers: { "cache-control": "private, max-age=3600" } });
}
