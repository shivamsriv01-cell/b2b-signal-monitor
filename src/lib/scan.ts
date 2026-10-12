import "server-only";
import { LOOKBACK_DAYS, MIN_TRIGGER_STRENGTH } from "./config";
import { analyseAccount, draftAngle } from "./gemini";
import { fetchAccountNews } from "./news";
import { scoreAccount } from "./scoring";
import { db, type Account, type Signal } from "./supabase";

export type AccountResult = {
  account: string;
  fetched: number;
  newArticles: number;
  newSignals: number;
  warmth: number;
  error?: string;
};

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function scanAccount(acc: Account): Promise<AccountResult> {
  const result: AccountResult = { account: acc.name, fetched: 0, newArticles: 0, newSignals: 0, warmth: 0 };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  try {
    // 1. Live news
    const articles = await fetchAccountNews(acc.news_query);
    result.fetched = articles.length;

    // 2. Drop anything already classified
    const [{ data: known }, { data: seen }] = await Promise.all([
      db().from("signals").select("url").eq("account_id", acc.id),
      db().from("seen_articles").select("url").eq("account_id", acc.id),
    ]);
    const done = new Set([...(known ?? []), ...(seen ?? [])].map((r) => r.url));
    const fresh = articles.filter((a) => !done.has(a.url));
    result.newArticles = fresh.length;

    const { data: recentRows } = await db()
      .from("signals")
      .select("*")
      .eq("account_id", acc.id)
      .gte("detected_at", since)
      .order("published_at", { ascending: false });
    const recent = (recentRows ?? []) as Signal[];
    const recentLines = recent
      .filter((s) => s.strength >= MIN_TRIGGER_STRENGTH)
      .slice(0, 6)
      .map((s) => `${s.signal_type} (${s.published_at?.slice(0, 10) ?? "?"}): ${s.summary}`);

    // 3. Gemini: classify new articles + draft the angle
    let angle: string | null = null;
    if (fresh.length > 0) {
      const analysis = await analyseAccount(acc.name, acc.stage, fresh, recentLines);
      const rows = analysis.articles
        .filter((c) => c.about_company && c.is_trigger && c.strength > 0)
        .map((c) => {
          const a = fresh[c.index];
          return {
            account_id: acc.id,
            url: a.url,
            title: a.title,
            source: a.source,
            published_at: a.publishedAt,
            signal_type: c.signal_type,
            strength: Math.max(0, Math.min(10, Math.round(c.strength))),
            summary: c.summary,
          };
        });
      if (rows.length) {
        const { error } = await db().from("signals").upsert(rows, { onConflict: "account_id,url", ignoreDuplicates: true });
        if (error) throw error;
      }
      const triggerUrls = new Set(rows.map((r) => r.url));
      const notTriggers = fresh.filter((a) => !triggerUrls.has(a.url)).map((a) => ({ account_id: acc.id, url: a.url }));
      if (notTriggers.length) {
        await db().from("seen_articles").upsert(notTriggers, { onConflict: "account_id,url", ignoreDuplicates: true });
      }
      result.newSignals = rows.filter((r) => r.strength >= MIN_TRIGGER_STRENGTH).length;
      if (result.newSignals > 0) angle = analysis.outreach_angle;
      recent.push(...(rows as unknown as Signal[]).map((r) => ({ ...r, detected_at: new Date().toISOString() })));
    }

    // 4. Re-score from all signals in the lookback window (this is what makes quiet accounts decay)
    const score = scoreAccount(recent);
    result.warmth = score.warmth_score;
    if (!angle && score.warmth_score > 0 && !acc.outreach_angle) {
      angle = await draftAngle(acc.name, acc.stage, recentLines);
    }

    // 5. Write back ONLY signal-derived columns, via the guarded RPC
    const { error } = await db().rpc("apply_account_signals", {
      p_account_id: acc.id,
      p_warmth_score: score.warmth_score,
      p_hot_score_3d: score.hot_score_3d,
      p_signal_count_3d: score.signal_count_3d,
      p_top_signal_type: score.top_signal_type,
      p_signal_summary: score.signal_summary,
      p_outreach_angle: angle,
      p_last_signal_at: score.last_signal_at,
    });
    if (error) throw error;
  } catch (err) {
    result.error = String((err as Error)?.message ?? err);
  }
  return result;
}

export async function runScan(trigger: string) {
  const { data: run } = await db().from("scan_runs").insert({ trigger }).select("id").single();
  const { data: accounts, error } = await db().from("accounts").select("*").order("name");
  if (error) throw error;

  const results = await pool((accounts ?? []) as Account[], 3, scanAccount);

  const summary = {
    accounts_scanned: results.length,
    articles_fetched: results.reduce((t, r) => t + r.fetched, 0),
    new_signals: results.reduce((t, r) => t + r.newSignals, 0),
    errors: results.filter((r) => r.error).map((r) => ({ account: r.account, error: r.error })),
  };
  if (run) {
    await db().from("scan_runs").update({ ...summary, finished_at: new Date().toISOString() }).eq("id", run.id);
  }
  return { runId: run?.id as number | undefined, ...summary, results };
}
