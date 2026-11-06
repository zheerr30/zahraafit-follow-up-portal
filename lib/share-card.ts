"use client";

import { genderText } from "@/lib/gender";

// Story-size share images (1080×1920), drawn on the phone with a canvas.
// Nothing is uploaded: the image is handed to the phone's share sheet or saved.

export type ShareCard =
  | { kind: "day"; eaten: number; target: number | null; p: number; c: number; f: number; done: number; total: number }
  | { kind: "meal"; photo: Blob | null; name: string; cal: number; p: number; c: number; f: number }
  | { kind: "streak"; days: number }
  | { kind: "weight"; lost: number; show: boolean }
  | { kind: "rings"; meals: { done: number; total: number } | null; cal: { eaten: number; target: number | null }; water: { n: number; goal: number }; workout: boolean | null; show: boolean }
  | { kind: "week"; days: number; avgCal: number | null; avgP: number | null; weight: number | null; show: boolean };

const W = 1080;
const H = 1920;
const FONT = '"IBM Plex Sans Arabic", system-ui, sans-serif';
const NAVY = "#010B1F";
const CLAY = "#FA5A02";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight = 700, color = "#fff", align: CanvasTextAlign = "center") {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.direction = "rtl";
  ctx.fillText(genderText(s), x, y);
}

/** Wraps Arabic text into lines that fit `maxW`. */
function wrap(ctx: CanvasRenderingContext2D, s: string, size: number, weight: number, maxW: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const words = genderText(s).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function macroBoxes(ctx: CanvasRenderingContext2D, y: number, p: number, c: number, f: number) {
  const items: [string, number][] = [["💪 بروتين", p], ["🌾 كارب", c], ["🫒 دهون", f]];
  const bw = 280, gap = 30, x0 = (W - (bw * 3 + gap * 2)) / 2;
  items.forEach(([l, v], i) => {
    const x = x0 + (2 - i) * (bw + gap); // right to left
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, x, y, bw, 170, 32);
    ctx.fill();
    text(ctx, `${Math.round(v)}g`, x + bw / 2, y + 88, 58);
    text(ctx, l, x + bw / 2, y + 140, 32, 500, "rgba(255,255,255,0.75)");
  });
}

export async function drawShareCard(card: ShareCard): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load(`700 64px ${FONT}`, "سعرة"), document.fonts.load(`500 32px ${FONT}`, "سعرة")]);
  } catch {}
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;

  // Background in the brand colors
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, "#0B1D4D");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 120, 260, 20, W - 120, 260, 520);
  glow.addColorStop(0, "rgba(250,90,2,0.35)");
  glow.addColorStop(1, "rgba(250,90,2,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  try {
    const logo = await loadImage("/brand/logo-mark.png");
    const lw = 340;
    ctx.drawImage(logo, (W - lw) / 2, 120, lw, (logo.naturalHeight / logo.naturalWidth) * lw);
  } catch {}

  if (card.kind === "day") {
    text(ctx, "خلصت وجباتي اليوم ✅", W / 2, 470, 76);
    const cx = W / 2, cy = 900, r = 290;
    ctx.lineWidth = 46;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const fill = card.target ? Math.min(1, card.eaten / card.target) : 1;
    ctx.strokeStyle = CLAY;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
    ctx.stroke();
    ctx.direction = "ltr";
    text(ctx, String(Math.round(card.eaten)), cx, cy + 30, 150);
    text(ctx, card.target ? `سعرة من ${card.target}` : "سعرة", cx, cy + 110, 44, 500, "rgba(255,255,255,0.8)");
    macroBoxes(ctx, 1290, card.p, card.c, card.f);
    if (card.total) text(ctx, `${card.done} من ${card.total} وجبات 💪`, W / 2, 1560, 48, 600, "#7EE2A8");
  } else if (card.kind === "meal") {
    const box = { x: 90, y: 400, w: 900, h: 900 };
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, 48);
    ctx.clip();
    if (card.photo) {
      try {
        const url = URL.createObjectURL(card.photo);
        const img = await loadImage(url);
        URL.revokeObjectURL(url);
        const s = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
        const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
        ctx.drawImage(img, box.x + (box.w - iw) / 2, box.y + (box.h - ih) / 2, iw, ih);
      } catch {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(box.x, box.y, box.w, box.h);
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      text(ctx, "🍽️", W / 2, box.y + box.h / 2 + 60, 180);
    }
    ctx.restore();
    const lines = wrap(ctx, card.name, 62, 700, 900).slice(0, 2);
    lines.forEach((l, i) => text(ctx, l, W / 2, 1400 + i * 80, 62));
    text(ctx, `🔥 ${Math.round(card.cal)} سعرة`, W / 2, 1400 + lines.length * 80 + 30, 56, 700, "#FFB088");
    macroBoxes(ctx, 1400 + lines.length * 80 + 90, card.p, card.c, card.f);
  } else if (card.kind === "streak") {
    text(ctx, "🔥", W / 2, 700, 200);
    ctx.direction = "ltr";
    text(ctx, String(card.days), W / 2, 1060, 300);
    text(ctx, "أيام ورا بعض", W / 2, 1200, 80);
    text(ctx, "التزمت بخطتي 💪", W / 2, 1320, 80, 700, "#FFB088");
  } else if (card.kind === "rings") {
    text(ctx, "ملخص يومي", W / 2, 470, 76);
    const rings: { pct: number; color: string; label: string; em: string }[] = [];
    const foodPct = card.meals?.total ? card.meals.done / card.meals.total : card.cal.target ? card.cal.eaten / card.cal.target : card.cal.eaten ? 1 : 0;
    rings.push({ pct: foodPct, color: CLAY, em: "🍽️", label: card.meals?.total ? `${card.meals.done} من ${card.meals.total} وجبات` : card.show ? `${Math.round(card.cal.eaten)} سعرة` : foodPct >= 0.9 ? "ضبطت أكلي" : "سجلت أكلي" });
    rings.push({ pct: card.water.goal ? card.water.n / card.water.goal : 0, color: "#3B8BEB", em: "💧", label: `${card.water.n} من ${card.water.goal} أكواب` });
    if (card.workout !== null) rings.push({ pct: card.workout ? 1 : 0, color: "#2FBF71", em: "💪", label: card.workout ? "التمرين خلص" : "التمرين باقي" });
    const cx = W / 2, cy = 860, lw = 62, gap = 18;
    rings.forEach((r, i) => {
      const rad = 290 - i * (lw + gap);
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
      const f = Math.max(0, Math.min(1, r.pct));
      if (f > 0) {
        ctx.strokeStyle = r.color;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(f, 0.02));
        ctx.stroke();
      }
    });
    rings.forEach((r, i) => {
      const y0 = 1290 + i * 150;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(W - 190, y0 - 18, 22, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, r.label, W - 240, y0, 58, 700, "#fff", "right");
    });
    if (card.show && card.meals?.total) text(ctx, `🔥 ${Math.round(card.cal.eaten)} سعرة`, W / 2, 1290 + rings.length * 150 + 20, 50, 600, "#FFB088");
  } else if (card.kind === "week") {
    text(ctx, "📊 ملخص أسبوعي", W / 2, 480, 80);
    const rows: [string, string][] = [["📅 أيام التزمت فيها", `${card.days} من 7`]];
    if (card.avgCal) rows.push(["🔥 متوسط سعراتي", `${card.avgCal}`]);
    if (card.avgP) rows.push(["💪 متوسط البروتين", `${card.avgP}g`]);
    if (card.weight !== null && card.show) rows.push(["⚖️ تغير وزني", `${card.weight > 0 ? "+" : ""}${card.weight} كجم`]);
    rows.forEach(([l, v], i) => {
      const y0 = 640 + i * 230;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, 120, y0, W - 240, 190, 36);
      ctx.fill();
      text(ctx, l, W - 170, y0 + 82, 44, 500, "rgba(255,255,255,0.8)", "right");
      ctx.direction = "ltr";
      text(ctx, v, W - 170, y0 + 152, 64, 700, "#fff", "right");
    });
  } else {
    text(ctx, "🏆", W / 2, 700, 200);
    if (card.show) {
      text(ctx, `نزلت ${Math.round(card.lost * 10) / 10} كيلو`, W / 2, 1000, 110);
      text(ctx, "والرحلة مستمرة 💪", W / 2, 1130, 70, 600, "#FFB088");
    } else {
      text(ctx, "أقرب لهدفي", W / 2, 1000, 110);
      text(ctx, "كل أسبوع 💪", W / 2, 1130, 70, 600, "#FFB088");
    }
  }

  // Footer: brand and link to the app
  const host = typeof window !== "undefined" ? window.location.host : "";
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(140, H - 250, W - 280, 2);
  text(ctx, "ZahraaFit", W / 2, H - 165, 58, 700);
  ctx.direction = "ltr";
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.fillText(host, W / 2, H - 105);

  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("image"))), "image/png"));
}

/** Opens the phone's share sheet with the image, or downloads it where sharing files isn't supported. */
export async function shareImage(blob: Blob, name = "zahraafit.png") {
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "ZahraaFit" });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
