import { saveManualFields } from "./actions";
import { Controls } from "./controls";
import { CopyButton, SaveButton } from "./ui";
import { LOOKBACK_DAYS, MIN_TRIGGER_STRENGTH, SIGNAL_LABELS, type SignalType } from "@/lib/config";
import { db, type Account, type Signal } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STAGES = ["outreach", "discovery", "pilot", "customer"] as const;

function heat(score: number) {
  if (score >= 60) return { label: "Hot", tone: "hot" };
  if (score >= 25) return { label: "Warm", tone: "warm" };
  if (score > 0) return { label: "Cooling", tone: "cool" };
  return { label: "Quiet", tone: "quiet" };
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Next Monday/Thursday 08:00 IST (02:30 UTC), matching vercel.json. */
function nextHotList(now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, 2, 30));
    if ((d.getUTCDay() === 1 || d.getUTCDay() === 4) && d > now) {
      return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    }
  }
  return "—";
}

async function load() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const [acc, sig, run] = await Promise.all([
    db().from("accounts").select("*").order("warmth_score", { ascending: false }).order("name"),
    db()
      .from("signals")
      .select("*")
      .gte("detected_at", since)
      .gte("strength", MIN_TRIGGER_STRENGTH)
      .order("strength", { ascending: false }),
    db().from("scan_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (acc.error) throw new Error(acc.error.message);
  return {
    accounts: (acc.data ?? []) as Account[],
    signals: (sig.data ?? []) as Signal[],
    lastRun: run.data as { started_at: string; trigger: string } | null,
  };
}

function NotesForm({ a, compact = false }: { a: Account; compact?: boolean }) {
  return (
    <form action={saveManualFields} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={a.id} />
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <label className="field-label">
          Stage
          <select name="stage" defaultValue={a.stage} className="field">
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Last contact
          <input type="date" name="last_contact_date" defaultValue={a.last_contact_date ?? ""} className="field" />
        </label>
        <label className={`field-label ${compact ? "" : "sm:col-span-2"}`}>
          Relationship read
          <input name="relationship_read" defaultValue={a.relationship_read ?? ""} className="field" />
        </label>
      </div>
      <label className="field-label">
        Notes
        <textarea name="owner_notes" defaultValue={a.owner_notes ?? ""} rows={2} className="field" />
      </label>
      <SaveButton />
    </form>
  );
}

function AccountCard({ a, signals }: { a: Account; signals: Signal[] }) {
  const h = heat(a.warmth_score);
  const score = Math.round(a.warmth_score);
  return (
    <article className={`card account tone-${h.tone}`}>
      <header className="flex items-start gap-4">
        <div className="avatar">{a.name.replace(/[^A-Za-z]/g, "").slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold leading-tight">{a.name}</h2>
            <span className={`pill pill-${h.tone}`}>{h.label}</span>
            <span className="pill pill-stage">{a.stage}</span>
          </div>
          <p className="meta mt-1">
            {a.domain} · last signal {ago(a.last_signal_at)} · you last spoke {a.last_contact_date ? fmtDate(a.last_contact_date) : "never"}
          </p>
        </div>
        <div className="score-block" title="Warmth score (0–100). Decays as signals age.">
          <span className="score-num">{score}</span>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${score}%` }} />
          </div>
        </div>
      </header>

      {a.signal_summary && (
        <div className="mt-5">
          <p className="eyebrow">Why now</p>
          <p className="why mt-1">{a.signal_summary.replace(/^[^:]+:\s*/, "")}</p>
        </div>
      )}

      {a.outreach_angle && (
        <div className="angle mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Suggested outreach · Gemini</p>
            <CopyButton text={a.outreach_angle} />
          </div>
          <p className="mt-2 text-[0.95rem] leading-relaxed">{a.outreach_angle}</p>
        </div>
      )}

      {signals.length > 0 && (
        <div className="mt-5">
          <p className="eyebrow">Evidence</p>
          <ul className="mt-2 flex flex-col">
            {signals.map((s) => (
              <li key={s.id} className="signal">
                <span className="type-tag">{SIGNAL_LABELS[s.signal_type as SignalType] ?? s.signal_type}</span>
                <div className="min-w-0 flex-1">
                  <a href={s.url} target="_blank" rel="noreferrer" className="link">
                    {s.title}
                  </a>
                  <p className="meta">
                    {s.source?.replace(/^https?:\/\//, "").replace(/\/$/, "")} · {fmtDate(s.published_at)}
                  </p>
                </div>
                <span className="strength" title={`Signal strength ${s.strength}/10`}>
                  {s.strength}
                  <span className="text-[var(--muted)]">/10</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="notes mt-5">
        <summary>
          <span className="eyebrow">Your notes</span>
          <span className="lock">never overwritten by the system</span>
          <span className="notes-preview">{a.relationship_read ?? a.owner_notes ?? "Add notes"}</span>
        </summary>
        <div className="mt-3">
          <NotesForm a={a} />
        </div>
      </details>
    </article>
  );
}

function QuietRow({ a }: { a: Account }) {
  return (
    <details className="quiet-row">
      <summary>
        <span className="avatar avatar-sm">{a.name.replace(/[^A-Za-z]/g, "").slice(0, 1)}</span>
        <span className="font-medium">{a.name}</span>
        <span className="pill pill-stage">{a.stage}</span>
        <span className="meta hidden flex-1 truncate sm:block">{a.relationship_read}</span>
        <span className="meta ml-auto shrink-0">
          last spoke {a.last_contact_date ? fmtDate(a.last_contact_date) : "never"}
        </span>
      </summary>
      <div className="px-1 pb-4 pt-3">
        <NotesForm a={a} compact />
      </div>
    </details>
  );
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
  const active = accounts.filter((a) => a.warmth_score > 0);
  const quiet = accounts.filter((a) => a.warmth_score <= 0);
  const hot3d = accounts.filter((a) => a.hot_score_3d > 0).length;
  const signals3d = signals.filter((s) => s.published_at && Date.now() - new Date(s.published_at).getTime() < 3 * 86_400_000);

  const stats = [
    { label: "On this week's Hot List", value: hot3d, sub: "trigger in the last 3 days" },
    { label: "Worth a conversation", value: active.length, sub: `of ${accounts.length} accounts` },
    { label: "Fresh signals", value: signals3d.length, sub: "last 3 days" },
    { label: "Next Hot List", value: nextHotList(), sub: "8:00 AM IST, Mon & Thu" },
  ];

  return (
    <main className="wrap">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="brand-dot" />
            <span className="eyebrow">Account Signal Monitor</span>
          </div>
          <h1 className="title mt-1">Who&apos;s worth calling this week</h1>
          <p className="meta mt-1">
            Arjun&apos;s {accounts.length} accounts · live news scanned {lastRun ? ago(lastRun.started_at) : "never"} ·
            scored by Gemini Flash
          </p>
        </div>
        <Controls />
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <p className="stat-label">{s.label}</p>
            <p className="stat-value">{s.value}</p>
            <p className="meta">{s.sub}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="section-title">Reach out now</h2>
        {active.length === 0 ? (
          <p className="card mt-3 meta">No live triggers. Click “Scan now” to check the news.</p>
        ) : (
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            {active.map((a) => (
              <AccountCard key={a.id} a={a} signals={signals.filter((s) => s.account_id === a.id).slice(0, 4)} />
            ))}
          </div>
        )}
      </section>

      {quiet.length > 0 && (
        <section className="mt-10">
          <h2 className="section-title">Gone quiet</h2>
          <p className="meta mt-1">No trigger events right now. They&apos;ll move back up as soon as something happens.</p>
          <div className="card mt-3 p-0">
            {quiet.map((a) => (
              <QuietRow key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}

      <footer className="meta mt-12 text-center">
        Signals from Google News · classified by Gemini Flash · stored in Supabase · Hot List by email every Monday &amp; Thursday
      </footer>
    </main>
  );
}
