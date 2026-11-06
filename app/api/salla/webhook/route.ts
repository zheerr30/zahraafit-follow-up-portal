import { createClient } from "@supabase/supabase-js";

// Salla calls this when an order changes. We pass the exact body and its
// signature to the database (public.salla_webhook), which checks the signature
// with the secret the coach saved, ignores unpaid or non-subscription orders,
// never applies an order twice, and activates or queues the subscription.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return Response.json({ ok: false }, { status: 500 });
  const body = await req.text();
  if (body.length > 500_000) return Response.json({ ok: false }, { status: 413 });
  const signature = req.headers.get("x-salla-signature") || "";
  const auth = (req.headers.get("authorization") || "").replace(/^(Bearer|Token)\s+/i, "");
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("salla_webhook", { p_body: body, p_signature: signature, p_token: auth || null });
  if (error) return Response.json({ ok: false }, { status: 500 });
  // Salla retries on errors; a refused signature is final.
  return Response.json({ ok: data !== "unauthorized", result: data }, { status: data === "unauthorized" ? 401 : 200 });
}
