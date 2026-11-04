import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Photos embedded in the coach's generator (covers, logo), served by hash so
// saved plan documents can link to them instead of carrying a copy each.
// Only images that are in the generator file can be served.

const MIN = 2000;
const URI_RE = /data:((?:image|font)\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)/g;
let cache: Map<string, { type: string; data: Buffer }> | null = null;

async function assets() {
  if (cache) return cache;
  const html = await readFile(path.join(process.cwd(), "generators", "meal.html"), "utf8");
  const map = new Map<string, { type: string; data: Buffer }>();
  for (const m of html.matchAll(URI_RE)) {
    if (m[0].length < MIN) continue;
    const h = createHash("sha256").update(m[0]).digest("hex").slice(0, 24);
    if (!map.has(h)) map.set(h, { type: m[1], data: Buffer.from(m[2], "base64") });
  }
  cache = map;
  return map;
}

export async function GET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  const a = (await assets()).get(hash);
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.data), { headers: { "content-type": a.type, "cache-control": "public, max-age=31536000, immutable" } });
}
