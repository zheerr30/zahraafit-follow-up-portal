import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Serves the coach's generator files (generators/*.html) to the coach only.
// The page sends her Supabase access token; we check it belongs to an admin.

const FILES: Record<string, string> = { meal: "meal.html" };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = FILES[name];
  if (!file) return new Response("Not found", { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: user } = await supabase.auth.getUser(token);
  if (!user.user) return new Response("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.user.id).single();
  if (profile?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const html = await readFile(path.join(process.cwd(), "generators", file), "utf8");
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" }
  });
}
