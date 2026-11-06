"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/** «حسابي»: weekly tips in words only, without calorie/weight numbers. */
export function HideNumbersToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <section className="card stack">
      <label className="row between" style={{ cursor: "pointer" }}>
        <span>
          <b>🙈 توصيات بدون أرقام</b>
          <span className="note" style={{ display: "block" }}>توصيات الجمعة تجيك بالكلام بس، بدون سعرات ولا جرامات ولا وزن.</span>
        </span>
        <input type="checkbox" checked={on} onChange={async () => {
          const next = !on;
          const { error } = await supabase.rpc("set_hide_numbers", { p_hide: next });
          if (!error) setOn(next);
        }} style={{ width: 22, height: 22, accentColor: "var(--clay)", flex: "none" }} />
      </label>
    </section>
  );
}
