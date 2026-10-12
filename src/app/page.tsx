import { saveManualFields } from "./actions";
import { Controls } from "./controls";
import { LOOKBACK_DAYS, SIGNAL_LABELS, type SignalType } from "@/lib/config";
import { db, type Account, type Signal } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STAGES = ["outreach", "discovery", "pilot", "customer"] as const;

function heat(score: number) {
  if (score >= 60) return { label: "Hot", cls: "chip-hot" };
  if (score >= 25) return { label: "Warm", cls: "chip-warm" };
  if (score > 0) return { label: "Cooling", cls: "chip-cool" };
  return { label: "Quiet", cls: "chip-quiet" };
}

function ago(iso: string | null) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}

async function load() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const [acc, sig, run] = await Promise.all([
    db().from("accounts").select("*").order("warmth_score", { ascending: false }).order("name"),
    db().from("signals").select("*").gte("detected_at", since).order("published_at", { ascending: false }),
    db().from("scan_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (acc.error) throw new Error(acc.error.message);
  return {
    accounts: (acc.data ?? []) as Account[],
    signals: (sig.data ?? []) as Signal[],
    lastRun: run.data as { started_at: string; new_signals: number; trigger: string } | null,
  };
}

export default async function Dashboard() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <main className="wrap">
        <h1 className="title">Account Signal Monitor</h1>
        <p className="card mt-4">Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run supabase/schema.sql and seed.sql.</p>
      </main>
    );
  }

  const { accounts, signals, lastRun } = await load();
  const warmCount = accounts.filter((a) => a.hot_score_3d > 0).length;

  return (
    <main className="wrap">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="title">Account Signal Monitor</h1>
          <p className="text-sm text-[var(--muted)]">
            {warmCount} of {accounts.length} accounts have a trigger in the last 3 days · last scan{" "}
            {lastRun ? `${ago(lastRun.started_at)} (${lastRun.trigger})` : "never"} · Hot List emails Mon &amp; Thu 8:00 IST
          </p>
        </div>
        <Controls />
      </header>

      <div className="mt-6 flex flex-col gap-3">
        {accounts.map((a) => {
          const h = heat(a.warmth_score);
          const accSignals = signals.filter((s) => s.account_id === a.id && s.strength >= 4).slice(0, 5);
          return (
            <details key={a.id} className="card" open={a.hot_score_3d > 0}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                <span className="score">{Math.round(a.warmth_score)}</span>
                <span className="text-base font-semibold">{a.name}</span>
                <span className={`chip ${h.cls}`}>{h.label}</span>
                <span className="chip chip-quiet">{a.stage}</span>
                <span className="ml-auto text-xs text-[var(--muted)]">
                  last signal {ago(a.last_signal_at)} · last contact {a.last_contact_date ?? "—"}
                </span>
              </summary>

              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {/* SYSTEM — signal-derived, read-only here */}
                <section>
                  <h3 className="label">What changed (system)</h3>
                  {a.warmth_score > 0 && a.signal_summary ? (
                    <>
                      <p className="mt-1 text-sm">{a.signal_summary}</p>
                      {a.outreach_angle && (
                        <p className="angle mt-3 text-sm">
                          <b>Outreach angle · </b>
                          {a.outreach_angle}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--muted)]">No live trigger. This account sinks until something happens.</p>
                  )}
                  {accSignals.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {accSignals.map((s) => (
                        <li key={s.id} className="text-sm">
                          <span className="chip chip-quiet mr-2">
                            {SIGNAL_LABELS[s.signal_type as SignalType] ?? s.signal_type} · {s.strength}/10
                          </span>
                          <a href={s.url} target="_blank" rel="noreferrer" className="link">
                            {s.title}
                          </a>
                          <span className="text-xs text-[var(--muted)]">
                            {" "}
                            — {s.source} · {s.published_at?.slice(0, 10)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* ARJUN — manual, never written by the system */}
                <form action={saveManualFields} className="flex flex-col gap-2">
                  <h3 className="label">Arjun&apos;s notes (never overwritten by the system)</h3>
                  <input type="hidden" name="id" value={a.id} />
                  <div className="flex gap-2">
                    <label className="flex flex-1 flex-col text-xs text-[var(--muted)]">
                      Stage
                      <select name="stage" defaultValue={a.stage} className="field">
                        {STAGES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-1 flex-col text-xs text-[var(--muted)]">
                      Last contact
                      <input type="date" name="last_contact_date" defaultValue={a.last_contact_date ?? ""} className="field" />
                    </label>
                  </div>
                  <label className="flex flex-col text-xs text-[var(--muted)]">
                    Relationship read
                    <input name="relationship_read" defaultValue={a.relationship_read ?? ""} className="field" />
                  </label>
                  <label className="flex flex-col text-xs text-[var(--muted)]">
                    Notes
                    <textarea name="owner_notes" defaultValue={a.owner_notes ?? ""} rows={3} className="field" />
                  </label>
                  <button className="btn self-start">Save my notes</button>
                </form>
              </div>
            </details>
          );
        })}
      </div>
    </main>
  );
}
