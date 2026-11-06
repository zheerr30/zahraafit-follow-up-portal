"use client";

import { genderText } from "@/lib/gender";

// Share images, drawn on the phone with a canvas. Nothing is uploaded.
// A card (the content) is drawn on its own transparent canvas, then placed on
// a background: transparent (a sticker), the brand navy, or a photo she picks.

export type DayInfo = {
  cal: number;
  target: number | null;
  p: number;
  c: number;
  f: number;
  water: number | null;
  waterGoal: number | null;
  meals: { done: number; total: number } | null;
  streak: number | null;
  weight: number | null;
  workout: boolean | null;
};

export type ShareCard =
  | { kind: "day"; day: DayInfo }
  | { kind: "meal"; photo: Blob | null; name: string; cal: number; p: number; c: number; f: number }
  | { kind: "streak"; days: number }
  | { kind: "weight"; lost: number }
  | { kind: "week"; on: boolean[]; avgCal: number | null; avgP: number | null; workouts: number | null; weight: number | null }
  | { kind: "workout"; title: string; min: number; sets: number; vol: number; primary: string[]; secondary: string[]; prs: { name: string; w: number }[] };

export type Toggle = "cal" | "macros" | "water" | "meals" | "streak" | "weight";
export const TOGGLE_LABEL: Record<Toggle, string> = { cal: "السعرات", macros: "الماكروز", water: "الماء", meals: "الوجبات", streak: "أيام الالتزام", weight: "الوزن" };
export type Design = "rings" | "numbers" | "line" | "single";
export const DESIGN_LABEL: Record<Design, string> = { rings: "الحلقات", numbers: "أرقام", line: "سطر واحد", single: "البطاقة" };
export type Bg = "clear" | "navy" | "photo";
export type Ink = "white" | "navy";
export type Place = { x: number; y: number; s: number };
export type Opts = { design: Design; ink: Ink; show: Record<Toggle, boolean>; link: boolean };

/** The designs and on/off switches each card offers, and which switches start on. */
export function cardSetup(card: ShareCard): { designs: Design[]; toggles: Toggle[]; on: Toggle[] } {
  switch (card.kind) {
    case "day": {
      const d = card.day;
      const t: Toggle[] = ["cal", "macros"];
      if (d.water !== null) t.push("water");
      if (d.meals) t.push("meals");
      if (d.streak !== null) t.push("streak");
      if (d.weight !== null) t.push("weight");
      return { designs: ["rings", "numbers", "line"], toggles: t, on: t.filter((x) => x !== "cal" && x !== "weight") };
    }
    case "meal":
      return { designs: ["single"], toggles: ["cal", "macros"], on: ["cal", "macros"] };
    case "week": {
      const t: Toggle[] = ["streak"];
      if (card.avgCal) t.push("cal");
      if (card.avgP) t.push("macros");
      if (card.weight !== null) t.push("weight");
      return { designs: ["single"], toggles: t, on: ["streak", "macros"] };
    }
    case "weight":
      return { designs: ["single"], toggles: ["weight"], on: [] };
    default:
      return { designs: ["single"], toggles: [], on: [] };
  }
}

const W = 1080;
const H = 1920;
const CW = 960; // card width
const FONT = '"IBM Plex Sans Arabic", system-ui, sans-serif';
const NAVY = "#010B1F";
const CLAY = "#FA5A02";
const BLUE = "#3B8BEB";
const GREEN = "#2FBF71";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

const logos: Partial<Record<Ink, Promise<HTMLImageElement | null>>> = {};
function logo(ink: Ink) {
  return (logos[ink] ||= loadImage(ink === "white" ? "/brand/logo-mark.png" : "/brand/logo.png").catch(() => null));
}

type Pen = { ink: string; sub: string; faint: string; shadow: string | null };
const pen = (ink: Ink, shadow: boolean): Pen =>
  ink === "white"
    ? { ink: "#fff", sub: "rgba(255,255,255,0.78)", faint: "rgba(255,255,255,0.16)", shadow: shadow ? "rgba(0,0,0,0.45)" : null }
    : { ink: NAVY, sub: "rgba(1,11,31,0.72)", faint: "rgba(1,11,31,0.12)", shadow: shadow ? "rgba(255,255,255,0.6)" : null };

function text(ctx: CanvasRenderingContext2D, p: Pen, s: string, x: number, y: number, size: number, weight = 700, color = p.ink, align: CanvasTextAlign = "center", dir: CanvasDirection = "rtl") {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.direction = dir;
  if (p.shadow) {
    ctx.shadowColor = p.shadow;
    ctx.shadowBlur = 14;
  }
  ctx.fillText(genderText(s), x, y);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, s: string, size: number, weight: number, maxW: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const lines: string[] = [];
  let cur = "";
  for (const w of genderText(s).split(" ")) {
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

function ring(ctx: CanvasRenderingContext2D, p: Pen, cx: number, cy: number, r: number, lw: number, pct: number, color: string) {
  ctx.lineCap = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = p.faint;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const f = Math.max(0, Math.min(1, pct));
  if (f > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(f, 0.02));
    ctx.stroke();
  }
}

const g = (v: number) => `${Math.round(v)}g`;

// ── body map (front and back), muscles colored: main dark, helpers light ──
type Shape = [number, number, number, number, number?]; // cx, cy, rx, ry, rotation
const FRONT: Record<string, Shape[]> = {
  frontdelt: [[63, 92, 13, 15, -0.3], [137, 92, 13, 15, 0.3]],
  sidedelt: [[54, 98, 8, 14, -0.2], [146, 98, 8, 14, 0.2]],
  chest: [[83, 112, 17, 13], [117, 112, 17, 13]],
  biceps: [[52, 140, 9, 20, 0.15], [148, 140, 9, 20, -0.15]],
  forearms: [[44, 188, 8, 22, 0.2], [156, 188, 8, 22, -0.2]],
  absfront: [[100, 163, 13, 32]],
  absside: [[80, 168, 6, 24, 0.1], [120, 168, 6, 24, -0.1]],
  quads: [[83, 262, 14, 40, 0.05], [117, 262, 14, 40, -0.05]],
  adductors: [[94, 245, 6, 22], [106, 245, 6, 22]],
  calves: [[83, 350, 10, 28], [117, 350, 10, 28]]
};
const BACK: Record<string, Shape[]> = {
  upperback: [[100, 96, 32, 14]],
  reardelt: [[62, 95, 12, 13, -0.3], [138, 95, 12, 13, 0.3]],
  sidedelt: [[54, 98, 8, 14, -0.2], [146, 98, 8, 14, 0.2]],
  midback: [[100, 126, 14, 16]],
  lats: [[80, 140, 13, 26, 0.15], [120, 140, 13, 26, -0.15]],
  lowerback: [[100, 178, 13, 14]],
  triceps: [[52, 140, 9, 20, 0.15], [148, 140, 9, 20, -0.15]],
  forearms: [[44, 188, 8, 22, 0.2], [156, 188, 8, 22, -0.2]],
  glutes: [[87, 220, 15, 15], [113, 220, 15, 15]],
  hamstrings: [[84, 272, 13, 36, 0.05], [116, 272, 13, 36, -0.05]],
  calves: [[84, 348, 11, 28], [116, 348, 11, 28]]
};
/** Helper muscles for each main muscle, when the exercise doesn't list them. */
export const SECONDARY: Record<string, string[]> = {
  chest: ["frontdelt", "triceps"],
  upperback: ["biceps", "reardelt", "lats"],
  lats: ["biceps", "reardelt"],
  midback: ["biceps", "reardelt"],
  frontdelt: ["sidedelt", "triceps"],
  sidedelt: ["frontdelt", "upperback"],
  reardelt: ["midback"],
  biceps: ["forearms"],
  triceps: ["frontdelt"],
  absfront: ["absside"],
  absside: ["absfront"],
  quads: ["glutes", "adductors"],
  glutes: ["hamstrings", "quads"],
  hamstrings: ["glutes", "calves"],
  adductors: ["glutes"],
  lowerback: ["glutes", "hamstrings"],
  calves: []
};

function body(ctx: CanvasRenderingContext2D, p: Pen, x0: number, y0: number, scale: number, map: Record<string, Shape[]>, primary: Set<string>, secondary: Set<string>) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.scale(scale, scale);
  ctx.fillStyle = p.faint;
  // silhouette
  ctx.beginPath();
  ctx.ellipse(100, 40, 21, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, 91, 60, 18, 18, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(58, 80);
  ctx.quadraticCurveTo(100, 70, 142, 80);
  ctx.lineTo(136, 150);
  ctx.lineTo(130, 212);
  ctx.lineTo(70, 212);
  ctx.lineTo(64, 150);
  ctx.closePath();
  ctx.fill();
  const limb = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    ctx.lineCap = "round";
    ctx.lineWidth = w;
    ctx.strokeStyle = p.faint;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  limb(56, 92, 46, 160, 20);
  limb(46, 160, 40, 216, 16);
  limb(144, 92, 154, 160, 20);
  limb(154, 160, 160, 216, 16);
  limb(85, 215, 83, 300, 30);
  limb(83, 300, 84, 392, 22);
  limb(115, 215, 117, 300, 30);
  limb(117, 300, 116, 392, 22);
  // muscles
  for (const [m, shapes] of Object.entries(map)) {
    const main = primary.has(m), help = !main && secondary.has(m);
    if (!main && !help) continue;
    ctx.fillStyle = main ? CLAY : "rgba(255,160,110,0.75)";
    for (const [cx, cy, rx, ry, rot] of shapes) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.2, ry * 1.12, rot || 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The card alone, on a transparent canvas cropped to its content. */
export async function drawCard(card: ShareCard, o: Opts, shadow: boolean): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([document.fonts.load(`700 64px ${FONT}`, "سعرة"), document.fonts.load(`500 32px ${FONT}`, "سعرة")]);
  } catch {}
  const p = pen(o.ink, shadow);
  const cv = document.createElement("canvas");
  cv.width = CW;
  cv.height = 1900;
  const ctx = cv.getContext("2d")!;
  const S = o.show;
  const cx = CW / 2;

  // small logo, always in the top corner
  const lg = await logo(o.ink);
  let y = 30;
  if (lg) {
    const lh = 70;
    ctx.drawImage(lg, CW - 40 - (lg.naturalWidth / lg.naturalHeight) * lh, y, (lg.naturalWidth / lg.naturalHeight) * lh, lh);
  }
  y += 70;

  if (card.kind === "day") {
    const d = card.day;
    const mealsTxt = d.meals?.total ? `${d.meals.done} من ${d.meals.total} وجبات` : null;
    const waterTxt = d.water !== null && d.waterGoal ? `${d.water} من ${d.waterGoal} أكواب` : null;
    const extra: string[] = [];
    if (S.cal) extra.push(`🔥 ${Math.round(d.cal)} سعرة`);
    if (S.macros) extra.push(`بروتين ${g(d.p)} · كارب ${g(d.c)} · دهون ${g(d.f)}`);
    if (S.streak && d.streak) extra.push(`🔥 يوم ${d.streak} ورا بعض`);
    if (S.weight && d.weight !== null) extra.push(`⚖️ ${d.weight} كجم`);

    if (o.design === "rings") {
      text(ctx, p, "ملخص يومي", cx, y + 70, 68);
      y += 120;
      const rings: { pct: number; color: string; label: string }[] = [];
      const foodPct = d.meals?.total ? d.meals.done / d.meals.total : d.target ? d.cal / d.target : d.cal ? 1 : 0;
      rings.push({ pct: foodPct, color: CLAY, label: S.meals && mealsTxt ? mealsTxt : S.cal ? `${Math.round(d.cal)} سعرة` : "أكلي" });
      if (d.water !== null && d.waterGoal) rings.push({ pct: d.water / d.waterGoal, color: BLUE, label: S.water && waterTxt ? waterTxt : "الماء" });
      if (d.workout !== null) rings.push({ pct: d.workout ? 1 : 0, color: GREEN, label: d.workout ? "التمرين خلص" : "التمرين باقي" });
      const R = 250, lw = 58, gap = 16;
      rings.forEach((r, i) => ring(ctx, p, cx, y + R + lw / 2, R - i * (lw + gap), lw, r.pct, r.color));
      y += 2 * R + lw + 70;
      rings.forEach((r) => {
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(cx + 230, y - 16, 18, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, p, r.label, cx + 190, y, 52, 700, p.ink, "right");
        y += 84;
      });
      const rest = extra.filter((e) => !(e.startsWith("🔥 ") && e.endsWith("سعرة") && !(S.meals && mealsTxt)));
      rest.forEach((e) => {
        text(ctx, p, e, cx, y + 10, 40, 600, p.sub);
        y += 64;
      });
    } else if (o.design === "numbers") {
      const items: [string, string, string][] = [];
      if (S.cal) items.push([String(Math.round(d.cal)), "سعرة", CLAY]);
      if (S.macros) items.push([g(d.p), "بروتين", CLAY]);
      if (S.water && waterTxt) items.push([`${d.water}/${d.waterGoal}`, "أكواب ماء", BLUE]);
      if (S.meals && d.meals?.total) items.push([`${d.meals.done}/${d.meals.total}`, "وجبات", CLAY]);
      if (S.streak && d.streak) items.push([String(d.streak), "أيام ورا بعض", CLAY]);
      if (S.weight && d.weight !== null) items.push([String(d.weight), "كجم", p.ink]);
      if (!items.length) items.push(["✓", "يومي", CLAY]);
      y += 40;
      items.forEach(([v, l, c]) => {
        text(ctx, p, v, cx, y + 170, 190, 800, c === p.ink ? p.ink : c, "center", "ltr");
        text(ctx, p, l, cx, y + 240, 50, 600, p.sub);
        y += 300;
      });
      if (S.macros) {
        text(ctx, p, `كارب ${g(d.c)} · دهون ${g(d.f)}`, cx, y + 20, 40, 600, p.sub);
        y += 70;
      }
    } else {
      const parts: string[] = [];
      if (S.meals && d.meals?.total) parts.push(`${d.meals.done}/${d.meals.total} وجبات`);
      if (S.water && d.water !== null) parts.push(`${d.water} أكواب`);
      if (S.streak && d.streak) parts.push(`يوم ${d.streak} ورا بعض`);
      if (S.cal) parts.push(`${Math.round(d.cal)} سعرة`);
      if (S.macros) parts.push(`بروتين ${g(d.p)}`);
      if (S.weight && d.weight !== null) parts.push(`${d.weight} كجم`);
      const lines = wrap(ctx, parts.join(" · ") || "التزمت بيومي", 56, 700, CW - 80);
      y += 10;
      lines.slice(0, 3).forEach((l) => {
        text(ctx, p, l, cx, y + 60, 56);
        y += 80;
      });
    }
  } else if (card.kind === "meal") {
    const box = { x: 40, y: y + 20, w: CW - 80, h: card.photo ? CW - 80 : 0 };
    if (card.photo) {
      ctx.save();
      roundRect(ctx, box.x, box.y, box.w, box.h, 48);
      ctx.clip();
      try {
        const url = URL.createObjectURL(card.photo);
        const img = await loadImage(url);
        URL.revokeObjectURL(url);
        const s = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
        const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
        ctx.drawImage(img, box.x + (box.w - iw) / 2, box.y + (box.h - ih) / 2, iw, ih);
      } catch {}
      ctx.restore();
      y = box.y + box.h + 20;
    }
    const lines = wrap(ctx, card.name, 62, 700, CW - 80).slice(0, 2);
    lines.forEach((l) => {
      text(ctx, p, l, cx, y + 70, 62);
      y += 82;
    });
    if (S.cal) {
      text(ctx, p, `🔥 ${Math.round(card.cal)} سعرة`, cx, y + 60, 56, 700, CLAY);
      y += 90;
    }
    if (S.macros) {
      text(ctx, p, `بروتين ${g(card.p)} · كارب ${g(card.c)} · دهون ${g(card.f)}`, cx, y + 50, 44, 600, p.sub);
      y += 80;
    }
  } else if (card.kind === "week") {
    text(ctx, p, "ملخص أسبوعي", cx, y + 70, 72);
    y += 120;
    if (S.streak) {
      const n = card.on.length, r = 44, gap = 22, total = n * 2 * r + (n - 1) * gap;
      card.on.forEach((on, i) => {
        const x = cx + total / 2 - r - i * (2 * r + gap);
        ctx.fillStyle = on ? CLAY : p.faint;
        ctx.beginPath();
        ctx.arc(x, y + r + 10, r, 0, Math.PI * 2);
        ctx.fill();
        if (on) text(ctx, { ...p, shadow: null }, "✓", x, y + r + 28, 46, 800, "#fff");
      });
      y += 2 * r + 40;
      text(ctx, p, `${card.on.filter(Boolean).length} من 7 أيام التزمت فيها`, cx, y + 40, 46, 600, p.sub);
      y += 90;
    }
    const rows: [string, string][] = [];
    if (S.cal && card.avgCal) rows.push(["متوسط السعرات", String(card.avgCal)]);
    if (S.macros && card.avgP) rows.push(["متوسط البروتين", `${card.avgP}g`]);
    if (card.workouts !== null) rows.push(["التمارين", String(card.workouts)]);
    if (S.weight && card.weight !== null) rows.push(["تغير الوزن", `${card.weight > 0 ? "+" : ""}${card.weight} كجم`]);
    rows.forEach(([l, v]) => {
      ctx.fillStyle = p.faint;
      roundRect(ctx, 60, y, CW - 120, 150, 32);
      ctx.fill();
      text(ctx, p, l, CW - 100, y + 92, 44, 600, p.sub, "right");
      text(ctx, p, v, 100, y + 98, 64, 800, p.ink, "left", "ltr");
      y += 175;
    });
  } else if (card.kind === "workout") {
    text(ctx, p, `تمرين اليوم: ${card.title}`, cx, y + 70, 58);
    y += 110;
    const prim = new Set(card.primary), sec = new Set(card.secondary);
    const sc = 2.05;
    body(ctx, p, cx + 20, y, sc, FRONT, prim, sec);
    body(ctx, p, cx - 20 - 200 * sc, y, sc, BACK, prim, sec);
    y += 400 * sc + 30;
    const stats: [string, string][] = [[String(card.min), "دقيقة"], [String(card.sets), "مجموعة"], [card.vol.toLocaleString("en-US"), "كجم الحجم الكلي"]];
    stats.forEach(([v, l], i) => {
      const x = cx + 300 - i * 300;
      text(ctx, p, v, x, y + 70, 80, 800, p.ink, "center", "ltr");
      text(ctx, p, l, x, y + 120, 34, 600, p.sub);
    });
    y += 160;
    card.prs.slice(0, 3).forEach((r) => {
      text(ctx, p, `🏅 أعلى وزن في ${r.name} ${r.w} كجم`, cx, y + 50, 42, 700, CLAY);
      y += 66;
    });
  } else if (card.kind === "streak") {
    text(ctx, p, "🔥", cx, y + 220, 200);
    text(ctx, p, String(card.days), cx, y + 500, 280, 800, p.ink, "center", "ltr");
    text(ctx, p, "أيام ورا بعض", cx, y + 620, 76);
    text(ctx, p, "التزمت بخطتي 💪", cx, y + 730, 72, 700, CLAY);
    y += 780;
  } else {
    text(ctx, p, "🏆", cx, y + 220, 200);
    if (S.weight) {
      text(ctx, p, `نزلت ${Math.round(card.lost * 10) / 10} كيلو`, cx, y + 400, 104);
      text(ctx, p, "والرحلة مستمرة 💪", cx, y + 510, 66, 700, CLAY);
    } else {
      text(ctx, p, "أقرب لهدفي", cx, y + 400, 104);
      text(ctx, p, "كل أسبوع 💪", cx, y + 510, 66, 700, CLAY);
    }
    y += 560;
  }

  if (o.link) {
    const host = typeof window !== "undefined" ? window.location.host : "";
    text(ctx, p, host, cx, y + 70, 32, 500, p.sub, "center", "ltr");
    y += 100;
  } else y += 30;

  const out = document.createElement("canvas");
  out.width = CW;
  out.height = Math.min(cv.height, y);
  out.getContext("2d")!.drawImage(cv, 0, 0);
  return out;
}

/** The final image: the card on its background. Transparent = just the card (a sticker). */
export function compose(card: HTMLCanvasElement, bg: Bg, photo: CanvasImageSource | null, place: Place): HTMLCanvasElement {
  if (bg === "clear") return card;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  if (bg === "photo" && photo) {
    const pw = (photo as HTMLImageElement).naturalWidth || (photo as HTMLCanvasElement).width;
    const ph = (photo as HTMLImageElement).naturalHeight || (photo as HTMLCanvasElement).height;
    const s = Math.max(W / pw, H / ph);
    ctx.drawImage(photo, (W - pw * s) / 2, (H - ph * s) / 2, pw * s, ph * s);
    const cw = CW * place.s, ch = card.height * place.s;
    ctx.drawImage(card, place.x * W - cw / 2, place.y * H - ch / 2, cw, ch);
  } else {
    const gr = ctx.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, NAVY);
    gr.addColorStop(1, "#0B1D4D");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W - 120, 260, 20, W - 120, 260, 520);
    glow.addColorStop(0, "rgba(250,90,2,0.35)");
    glow.addColorStop(1, "rgba(250,90,2,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const s = Math.min(1, (H - 160) / card.height);
    const cw = CW * s, ch = card.height * s;
    ctx.drawImage(card, (W - cw) / 2, (H - ch) / 2, cw, ch);
  }
  return cv;
}

export const toPng = (cv: HTMLCanvasElement) => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("image"))), "image/png"));

/** Opens the phone's share sheet with the image, or downloads it where sharing files isn't supported. */
export async function shareImage(blob: Blob, name = "zahraafit.png") {
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
    }
  }
  downloadImage(blob, name);
  return "downloaded";
}

export function downloadImage(blob: Blob, name = "zahraafit.png") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copies the PNG to the clipboard (paste it as a sticker in a story). Pass a promise so Safari keeps the tap. */
export async function copyImage(blob: Promise<Blob>) {
  const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!CI || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new CI({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export const canCopyImage = () => typeof window !== "undefined" && Boolean((window as unknown as { ClipboardItem?: unknown }).ClipboardItem && navigator.clipboard?.write);
