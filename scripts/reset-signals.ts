// Clears detected signals and signal-derived columns only. Arjun's manual columns are untouched.
import { db } from "../src/lib/supabase";
(async () => {
  await db().from("signals").delete().gte("id", 0);
  await db().from("seen_articles").delete().not("url", "is", null);
  const { error } = await db().from("accounts").update({
    warmth_score: 0, hot_score_3d: 0, signal_count_3d: 0, top_signal_type: null,
    signal_summary: null, outreach_angle: null, last_signal_at: null, signals_updated_at: null,
  }).not("id", "is", null);
  console.log(error ?? "signals reset");
})();
