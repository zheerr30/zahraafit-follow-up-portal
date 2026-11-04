// The generator's designed plan document is ~850 KB, mostly the same embedded
// photos and fonts in every plan. Before saving we swap each one that also exists in
// the generator file for a link (served by /api/generators/asset/[hash]) and
// gzip the rest, so a plan document is a few dozen KB in the database.

export const ASSET_MIN = 2000;

async function hashOf(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

const URI_RE = /data:(?:image|font)\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g;

async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzip(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Coach side: shrink the document. `generatorHtml` is the generator file the photos come from. */
export async function packDoc(html: string, generatorHtml: string) {
  const known = new Set((generatorHtml.match(URI_RE) || []).filter((u) => u.length >= ASSET_MIN));
  const found = Array.from(new Set((html.match(URI_RE) || []).filter((u) => u.length >= ASSET_MIN && known.has(u))));
  let out = html;
  for (const uri of found) {
    out = out.split(uri).join(`/api/generators/asset/${await hashOf(uri)}`);
  }
  try {
    return { format: "zahraafit-doc", gz: await gzip(out) };
  } catch {
    return { format: "zahraafit-doc", html: out };
  }
}

/** Subscriber side: the document's HTML, whichever way it was saved. */
export async function unpackDoc(d: { html?: string; gz?: string }) {
  if (d.gz) return gunzip(d.gz);
  return d.html || "";
}
