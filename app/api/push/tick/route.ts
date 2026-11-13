import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { runDaySummaries } from "@/lib/day-summary-server";

// Called every 10 minutes by the database (pg_cron → push_ping) with the shared
// secret, and right away after a subscriber asks for a test. Sends whatever
// reminders are due, after making the end-of-day summaries whose time has come
// (their notifications join the queue). Without the right secret the database returns nothing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Due = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string };

export async function POST(req: Request) {
  const secret = req.headers.get("x-push-secret") || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!secret || !url || !key) return Response.json({ ok: false }, { status: 400 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: keys } = await db.rpc("push_keys", { p_secret: secret });
  if (!keys) return Response.json({ ok: false }, { status: 403 });
  let pub = (keys as { public: string | null }).public;
  let priv = (keys as { private: string | null }).private;
  if (!pub || !priv) {
    // First run: make the site's signing keys and keep them in the database.
    const k = webpush.generateVAPIDKeys();
    await db.rpc("push_set_keys", { p_secret: secret, p_public: k.publicKey, p_private: k.privateKey });
    const { data: again } = await db.rpc("push_keys", { p_secret: secret });
    pub = (again as { public: string } | null)?.public || null;
    priv = (again as { private: string } | null)?.private || null;
    if (!pub || !priv) return Response.json({ ok: false }, { status: 500 });
  }

  // Summaries first, so their notifications go out in this same run.
  await runDaySummaries(db, secret).catch(() => 0);

  const { data: due, error } = await db.rpc("push_due", { p_secret: secret });
  if (error) return Response.json({ ok: false }, { status: 500 });
  const list = (due as Due[] | null) || [];
  let sent = 0;
  await Promise.all(
    list.map(async (m) => {
      try {
        await webpush.sendNotification(
          { endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url }),
          { TTL: 3600, urgency: "normal", vapidDetails: { subject: "https://zahraafit.com", publicKey: pub!, privateKey: priv! } }
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.rpc("push_forget", { p_secret: secret, p_endpoint: m.endpoint });
      }
    })
  );
  return Response.json({ ok: true, due: list.length, sent });
}
