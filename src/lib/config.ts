export const PRODUCT_PITCH =
  process.env.PRODUCT_PITCH ??
  "Arjun's product is a workforce management SaaS for Indian mid-market and enterprise companies: " +
    "shift scheduling and rostering, geo-fenced/biometric attendance, leave management, " +
    "Indian labour-law compliance across states, frontline workforce analytics (attrition, overtime, absenteeism), " +
    "and payroll-ready timesheets for large distributed or frontline teams.";

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
// Other Gemini Flash models to fall back to when the primary is overloaded (503) or retired (404).
export const GEMINI_FALLBACKS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];

export const SIGNAL_TYPES = [
  "headcount_expansion",
  "leadership_hire",
  "digitalisation",
  "funding",
  "operational_challenge",
  "expansion",
  "other",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  headcount_expansion: "Headcount expansion",
  leadership_hire: "New CHRO / VP Ops",
  digitalisation: "Workforce digitalisation",
  funding: "Funding round",
  operational_challenge: "Operational challenge",
  expansion: "Footprint expansion",
  other: "Other",
};

// How much each trigger type matters for a workforce-management sale.
export const TYPE_WEIGHT: Record<SignalType, number> = {
  headcount_expansion: 1.0,
  leadership_hire: 1.0,
  funding: 0.9,
  digitalisation: 0.9,
  operational_challenge: 0.9,
  expansion: 0.75,
  other: 0.3,
};

// A signal loses half its weight every HALF_LIFE_DAYS — quiet accounts sink on their own.
export const HALF_LIFE_DAYS = 3;
export const LOOKBACK_DAYS = 21;
export const HOTLIST_WINDOW_DAYS = 3;
export const HOTLIST_SIZE = 10;
// Signals below this strength are stored but not treated as triggers.
export const MIN_TRIGGER_STRENGTH = 4;
