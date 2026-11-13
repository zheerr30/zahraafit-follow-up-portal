"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { isRamadanMonth, ramadanActive, ramadanUntil } from "@/lib/ramadan";
import { supabase } from "@/lib/supabase";

async function load(profileId: string) {
  const { data } = await supabase.from("reminder_prefs").select("ramadan_until").eq("profile_id", profileId).maybeSingle();
  return (data as { ramadan_until?: string | null } | null)?.ramadan_until || null;
}

async function save(profileId: string, until: string | null) {
  const { error } = await supabase.from("reminder_prefs").upsert({ profile_id: profileId, ramadan_until: until }, { onConflict: "profile_id" });
  return !error;
}

/** «🌙 وضع رمضان» switch in «حسابي». */
export function RamadanToggle({ profileId }: { profileId: string }) {
  const [until, setUntil] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    load(profileId).then(setUntil);
  }, [profileId]);
  if (until === undefined) return null;
  const on = ramadanActive(until);
  return (
    <section className="card stack">
      <label className="row between" style={{ cursor: "pointer" }}>
        <span>
          <b>🌙 وضع رمضان</b>
          <span className="note" style={{ display: "block" }}>{on ? `شغال لين ${formatDate(until!)}، ويرجع العادي تلقائي بعد العيد.` : "وجباتك تصير فطور ووجبة بينية وسحور، وتذكير الماء بين المغرب والفجر."}</span>
        </span>
        <input type="checkbox" checked={on} onChange={async () => {
          const next = on ? null : ramadanUntil();
          if (await save(profileId, next)) window.location.reload();
        }} style={{ width: 22, height: 22, accentColor: "var(--clay)", flex: "none" }} />
      </label>
    </section>
  );
}

/** Home card on the first days of Ramadan, if the mode is off. */
export function RamadanSuggest({ profileId }: { profileId: string }) {
  const [until, setUntil] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (isRamadanMonth()) load(profileId).then(setUntil);
  }, [profileId]);
  if (until === undefined || ramadanActive(until)) return null;
  return (
    <section className="offer-card" style={{ alignItems: "center" }}>
      <span aria-hidden="true" style={{ fontSize: 30 }}>🌙</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b>رمضان كريم، نشغل وضع رمضان؟</b>
        <span>وجباتك تصير فطور ووجبة بينية وسحور، وتذكير الماء بين المغرب والفجر.</span>
      </span>
      <button type="button" className="btn btn-p btn-sm" onClick={async () => { if (await save(profileId, ramadanUntil())) window.location.reload(); }}>شغليه</button>
    </section>
  );
}
