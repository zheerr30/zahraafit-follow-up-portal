"use client";

import { useEffect, type RefObject } from "react";

// The subscriber screens are written addressing a woman. For a male subscriber
// the text on screen is switched to the masculine form with this dictionary,
// so every screen (and the coach's plan text) reads right without writing each
// sentence twice. Shadda (ّ) and tanween (ً) are removed and digits shown as 0123 for everyone.
//
// The dictionary itself is in lib/gender-core.ts: when you add subscriber text with a new
// feminine word (a verb ending in ي/ين/تي, or an adjective about her), add it there.

import { toGender, type Gender } from "@/lib/gender-core";
export type { Gender } from "@/lib/gender-core";
export { stripEmoji } from "@/lib/gender-core";

let current: Gender = "female";
export const setGender = (g: string | null | undefined) => {
  current = g === "male" ? "male" : "female";
};
export const getGender = () => current;

/** The text as this subscriber should see it. */
export function genderText(s: string, g: Gender = current) {
  return toGender(s, g);
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];

function fixNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest(".emo")) return;
    const v = node.nodeValue || "";
    const n = genderText(v);
    if (n !== v) {
      node.nodeValue = n;
      hideIfEmpty(node);
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEXTAREA") return;
  fixAttrs(el);
  el.querySelectorAll("[placeholder],[aria-label],[title],[alt]").forEach(fixAttrs);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const p = t.parentElement;
    if (p && (p.tagName === "TEXTAREA" || p.tagName === "SCRIPT" || p.tagName === "STYLE" || p.closest(".emo"))) continue;
    const v = t.nodeValue || "";
    const n = genderText(v);
    if (n !== v) {
      t.nodeValue = n;
      hideIfEmpty(t);
    }
  }
}

/** An icon box that held only an emoji is hidden once the emoji is gone. */
function hideIfEmpty(t: Node) {
  const p = t.parentElement;
  if (p && !(t.nodeValue || "").trim() && !p.textContent?.trim() && !p.querySelector("svg,img,video,canvas") && (p.getAttribute("aria-hidden") === "true" || p.classList.contains("em"))) p.style.display = "none";
}

function fixAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const n = genderText(v);
      if (n !== v) el.setAttribute(a, n);
    }
  }
}

/** Keeps the text under `ref` in her (or his) form as the screen changes. */
export function useGenderText(ref: RefObject<HTMLElement | null>, gender: Gender) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    setGender(gender);
    fixNode(root);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") fixNode(m.target);
        else if (m.type === "attributes") fixAttrs(m.target as Element);
        else m.addedNodes.forEach(fixNode);
      }
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => obs.disconnect();
  }, [ref, gender]);
}
