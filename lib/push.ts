"use client";

import { supabase } from "@/lib/supabase";

export type PushState = "unsupported" | "install" | "denied" | "off" | "on";

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !standalone() ? "install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(b64: string) {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask permission, subscribe this phone and save it. Returns an Arabic error or null. */
export async function turnOnPush(profileId: string): Promise<string | null> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "ما سمحتي بالإشعارات. تقدرين تسمحين لها من إعدادات الجوال.";
  const { data: key } = await supabase.rpc("push_public_key");
  if (!key) return "التذكيرات لسا تتجهز. جربي بعد شوي.";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key as string) });
  const j = sub.toJSON();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ profile_id: profileId, endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: "endpoint" });
  if (error) {
    // Another account used this phone before: start a fresh subscription for her.
    await sub.unsubscribe();
    const fresh = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key as string) });
    const f = fresh.toJSON();
    const { error: e2 } = await supabase.from("push_subscriptions").insert({ profile_id: profileId, endpoint: f.endpoint, p256dh: f.keys?.p256dh, auth: f.keys?.auth });
    if (e2) return "ما قدرنا نشغل التذكيرات. تأكدي من الاتصال وجربي مرة ثانية.";
  }
  return null;
}

export async function turnOffPush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
