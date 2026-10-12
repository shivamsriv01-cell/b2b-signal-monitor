import { db } from "../src/lib/supabase";
(async () => {
  const { data: s } = await db().from("signals").select("strength,signal_type,published_at,summary,accounts(name)").order("published_at", { ascending: false });
  for (const r of s ?? []) console.log(`${(r.accounts as any).name.padEnd(16)} ${r.published_at?.slice(0,10)} ${String(r.strength).padStart(2)} ${r.signal_type.padEnd(22)} ${r.summary.slice(0,80)}`);
  const { data: a } = await db().from("accounts").select("name,warmth_score,hot_score_3d,signal_summary,outreach_angle,owner_notes").order("warmth_score", { ascending: false }).limit(3);
  console.log(JSON.stringify(a, null, 1));
})();
