// Local runner: `npx tsx --conditions=react-server --env-file=.env.local scripts/scan.ts`
import { runScan } from "../src/lib/scan";

runScan("manual-cli").then((r) => {
  for (const a of r.results)
    console.log(`${a.account.padEnd(18)} fetched=${a.fetched} new=${a.newArticles} triggers=${a.newSignals} warmth=${a.warmth}${a.error ? "  ERROR: " + a.error : ""}`);
  console.log(`\n${r.accounts_scanned} accounts · ${r.articles_fetched} articles · ${r.new_signals} new triggers · ${r.errors.length} errors`);
});
