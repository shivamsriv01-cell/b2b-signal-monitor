import {
  HALF_LIFE_DAYS,
  HOTLIST_WINDOW_DAYS,
  MIN_TRIGGER_STRENGTH,
  SIGNAL_LABELS,
  TYPE_WEIGHT,
  type SignalType,
} from "./config";

export type ScoredSignal = {
  signal_type: string;
  strength: number;
  summary: string;
  published_at: string | null;
  detected_at: string;
};

const DAY = 86_400_000;

export function signalTime(s: ScoredSignal) {
  return new Date(s.published_at ?? s.detected_at).getTime();
}

function contribution(s: ScoredSignal, now: number) {
  if (s.strength < MIN_TRIGGER_STRENGTH) return 0;
  const ageDays = Math.max(0, (now - signalTime(s)) / DAY);
  const weight = TYPE_WEIGHT[s.signal_type as SignalType] ?? 0.3;
  return s.strength * weight * 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

/** Saturating 0–100 scale: one fresh strong trigger ≈ 65, two ≈ 90. */
function toScore(raw: number) {
  return Math.round(100 * (1 - Math.exp(-raw / 8)));
}

export function scoreAccount(signals: ScoredSignal[], now = Date.now()) {
  const triggers = signals.filter((s) => s.strength >= MIN_TRIGGER_STRENGTH);
  const windowStart = now - HOTLIST_WINDOW_DAYS * DAY;
  const recent = triggers.filter((s) => signalTime(s) >= windowStart);

  const warmth = toScore(triggers.reduce((t, s) => t + contribution(s, now), 0));
  const hot3d = toScore(recent.reduce((t, s) => t + contribution(s, now), 0));

  // The headline signal = the one contributing most right now.
  const top = [...triggers].sort((a, b) => contribution(b, now) - contribution(a, now))[0];
  const lastSignalAt = triggers.length
    ? new Date(Math.max(...triggers.map(signalTime))).toISOString()
    : null;

  return {
    warmth_score: warmth,
    hot_score_3d: hot3d,
    signal_count_3d: recent.length,
    top_signal_type: top?.signal_type ?? null,
    signal_summary: top ? `${SIGNAL_LABELS[top.signal_type as SignalType] ?? top.signal_type}: ${top.summary}` : null,
    last_signal_at: lastSignalAt,
  };
}
