# Components Map — B2B Account Signal Monitor

![Components Map](docs/components-map.png)

<sub>High-res: [PNG](docs/components-map.png) · [SVG](docs/components-map.svg). Mermaid version below.</sub>

```mermaid
flowchart LR
  subgraph Schedule["Vercel Cron"]
    C1["/api/cron/scan<br/>daily 06:00 IST (Tue/Wed/Fri/Sat/Sun)"]
    C2["/api/cron/hotlist<br/>Mon + Thu 08:00 IST"]
  end

  subgraph Sources["Live external data"]
    GN["Google News RSS<br/>(press releases, news articles;<br/>2 queries per account, en-IN)"]
  end

  subgraph Engine["Signal engine (Next.js server, src/lib)"]
    N["news.ts<br/>fetch + parse + de-dupe"]
    F["scan.ts<br/>drop already-seen URLs"]
    G["gemini.ts — Gemini Flash<br/>classify each article:<br/>about company? trigger? type, strength 0–10,<br/>one-line summary + outreach angle"]
    S["scoring.ts<br/>warmth = Σ strength × type weight × 0.5^(age/3d)<br/>→ quiet accounts decay automatically"]
    W["apply_account_signals() RPC<br/>writes ONLY signal columns"]
  end

  subgraph DB["Supabase (Postgres)"]
    A[("accounts<br/>MANUAL: stage, notes, last contact, relationship read<br/>SIGNAL: warmth, hot_score_3d, summary, angle, …")]
    T["guard trigger<br/>reverts any manual-column change<br/>made by the engine"]
    SG[("signals")]
    SA[("seen_articles")]
    R[("scan_runs")]
  end

  subgraph Out["Outputs"]
    E["hotlist.ts → Resend<br/>Hot List email: top 10 by 3-day score,<br/>one-line signal + Gemini angle"]
    D["Dashboard (/)<br/>ranked accounts, signals, angles;<br/>Arjun edits his own fields here"]
  end

  C1 --> N
  C2 --> N
  GN --> N --> F --> G --> SG
  G --> SA
  SG --> S --> W --> A
  T -. protects .- A
  C2 --> E
  A --> E
  A --> D
  SG --> D
  D -- "saveManualFields()<br/>writes ONLY manual columns" --> A
  N & G --> R
```

## Components

| # | Component | Tech | Responsibility |
|---|---|---|---|
| 1 | Scheduler | Vercel Cron (`vercel.json`) | Daily scan; Mon/Thu scan + Hot List email |
| 2 | News collector | `src/lib/news.ts`, Google News RSS | Live articles per account: a broad query plus a trigger-keyword query (hiring, CHRO, funding, expansion, attrition, digitalisation…) |
| 3 | De-duplication | `signals` + `seen_articles` tables | Each article is sent to Gemini at most once |
| 4 | AI classifier + angle writer | `src/lib/gemini.ts`, **Gemini Flash** (structured JSON output) | Is it about this company? Is it a trigger? Type, strength, one-line summary; stage-aware outreach angle tied to the product |
| 5 | Scoring | `src/lib/scoring.ts` | Time-decayed warmth (3-day half-life) and a 3-day hot score, so quiet accounts sink automatically |
| 6 | Safe write-back | `apply_account_signals` RPC + `protect_manual_columns` trigger | The system can update only signal-derived columns; Arjun's notes, last-contact date, stage and relationship read cannot be changed by the engine |
| 7 | Hot List email | `src/lib/hotlist.ts`, Resend | Top 10 accounts by 3-day signal strength, each with the signal, the angle and source links |
| 8 | Dashboard | `src/app/page.tsx` (Next.js, basic auth) | Ranked view; "Scan now" / "Send Hot List now"; Arjun edits only his own fields |
| 9 | Audit log | `scan_runs` table | Every run: articles fetched, new signals, errors, email sent |

## Column ownership (the core guarantee)

| Owner | Columns | Written by |
|---|---|---|
| **Arjun** | `stage`, `owner_notes`, `last_contact_date`, `relationship_read` | Dashboard form only (`saveManualFields`, explicit allow-list) |
| **System** | `warmth_score`, `hot_score_3d`, `signal_count_3d`, `top_signal_type`, `signal_summary`, `outreach_angle`, `last_signal_at`, `signals_updated_at` | `apply_account_signals` RPC only |

Even if the engine code tried to write a manual column, the Postgres trigger would put the old value back.
