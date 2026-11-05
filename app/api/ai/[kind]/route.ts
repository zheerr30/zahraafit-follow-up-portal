import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// Photo helpers for the food diary, using Claude vision:
//   label: read the nutrition facts panel of a product
//   meal:  estimate what is on the plate and its calories
//   menu:  read items and printed calories from a restaurant menu
// Needs ANTHROPIC_API_KEY in the Vercel environment. Each person has a daily
// limit (public.ai_take in phase8-food-tools.sql).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";

const NUM = { type: ["number", "null"] } as const;
const MACROS = {
  type: ["object", "null"],
  properties: { cal: NUM, p: NUM, c: NUM, f: NUM },
  required: ["cal", "p", "c", "f"],
  additionalProperties: false
} as const;

const JOBS = {
  label: {
    prompt: `This photo should show the nutrition facts panel of a packaged food or drink (Arabic and/or English).
Read the values exactly as printed. Return:
- name: the product name if visible on the photo, in Arabic if printed in Arabic, else as printed; null if not visible.
- per100: calories (kcal), protein, carbohydrate and fat per 100 g or 100 ml, if the panel gives them; else null.
- perServing: the same per serving, if the panel gives them; else null.
- serving_g: serving size in grams or ml, if printed; else null.
- serving_label: short Arabic word for the serving if printed (e.g. "حصة", "علبة", "قطعة"); else null.
- readable: false if this is not a nutrition panel or the numbers cannot be read.
If energy is only in kJ, convert to kcal (divide by 4.184). Never invent a number that is not printed: use null.`,
    schema: {
      type: "object",
      properties: {
        readable: { type: "boolean" },
        name: { type: ["string", "null"] },
        per100: MACROS,
        perServing: MACROS,
        serving_g: NUM,
        serving_label: { type: ["string", "null"] }
      },
      required: ["readable", "name", "per100", "perServing", "serving_g", "serving_label"],
      additionalProperties: false
    }
  },
  meal: {
    prompt: `You help a subscriber of a Saudi women's fitness coach log her food. Look at this photo of a meal and estimate what she is eating.
List each distinct food on the plate (rice, chicken, salad, bread, sauce, drink...) with an estimated cooked weight in grams and its calories, protein, carbs and fat for that weight. Use realistic portion sizes for what is visible (plate size, utensils, hands) and typical Saudi/Gulf home and restaurant recipes (oil in rice, sauces, etc.).
Names in short Arabic as people in Saudi Arabia say them (e.g. "رز كبسة", "دجاج مشوي", "سلطة خضار", "خبز صامولي").
note: one short Arabic sentence about what you were unsure of (e.g. hidden oil, sauce, portion), or null.
If the photo is not food, return an empty items list and say so in note.`,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              grams: { type: "number" },
              cal: { type: "number" },
              p: { type: "number" },
              c: { type: "number" },
              f: { type: "number" }
            },
            required: ["name", "grams", "cal", "p", "c", "f"],
            additionalProperties: false
          }
        },
        note: { type: ["string", "null"] }
      },
      required: ["items", "note"],
      additionalProperties: false
    }
  }
,
  menu: {
    prompt: `This photo shows a restaurant menu (board, printed menu or app screenshot), probably in Saudi Arabia where menus list calories.
List each food or drink item that has a calorie number printed next to it. Return:
- restaurant: the restaurant name if visible, else null.
- items: name as printed (keep Arabic if printed in Arabic; if both, prefer Arabic), and cal exactly as printed for that item. If a size is part of the item (small/medium/large, 6 pieces), include it in the name.
Only include items whose calories are printed; never estimate or invent calories. If no calories are visible, return an empty list.`,
    schema: {
      type: "object",
      properties: {
        restaurant: { type: ["string", "null"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, cal: { type: "number" } },
            required: ["name", "cal"],
            additionalProperties: false
          }
        }
      },
      required: ["restaurant", "items"],
      additionalProperties: false
    }
  }
} as const;

type Kind = keyof typeof JOBS;
const err = (status: number, code: string) => Response.json({ error: code }, { status });

export async function POST(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!(kind in JOBS)) return err(404, "not_found");
  const job = JOBS[kind as Kind];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return err(401, "signin");
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user } = await db.auth.getUser(token);
  if (!user.user) return err(401, "signin");

  if (!process.env.ANTHROPIC_API_KEY) return err(503, "not_configured");

  let image = "";
  try {
    const body = (await req.json()) as { image?: string };
    image = String(body.image || "").replace(/^data:image\/jpeg;base64,/, "");
  } catch {
    return err(400, "bad_image");
  }
  if (!image || image.length > 3_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return err(400, "bad_image");

  const { data: ok, error: limitErr } = await db.rpc("ai_take", { p_kind: kind });
  if (limitErr) return err(503, "not_configured");
  if (!ok) return err(429, "limit");

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: job.schema as unknown as Record<string, unknown> } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: job.prompt }
          ]
        }
      ]
    });
    if (res.stop_reason === "refusal") return err(422, "refused");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return err(502, "no_answer");
    return Response.json(JSON.parse(text.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return err(429, "busy");
    if (e instanceof Anthropic.AuthenticationError) return err(503, "not_configured");
    if (e instanceof SyntaxError) return err(502, "no_answer");
    return err(502, "failed");
  }
}
