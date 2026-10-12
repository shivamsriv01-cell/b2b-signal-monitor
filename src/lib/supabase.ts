import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export type Account = {
  id: string;
  name: string;
  domain: string | null;
  news_query: string;
  // manual — Arjun's
  stage: "outreach" | "discovery" | "pilot" | "customer";
  owner_notes: string | null;
  last_contact_date: string | null;
  relationship_read: string | null;
  // signal-derived — the system's
  warmth_score: number;
  hot_score_3d: number;
  signal_count_3d: number;
  top_signal_type: string | null;
  signal_summary: string | null;
  outreach_angle: string | null;
  last_signal_at: string | null;
  signals_updated_at: string | null;
};

export type Signal = {
  id: number;
  account_id: string;
  url: string;
  title: string;
  source: string | null;
  published_at: string | null;
  signal_type: string;
  strength: number;
  summary: string;
  detected_at: string;
};

// The only columns the dashboard may write — Arjun's own.
export const MANUAL_COLUMNS = ["stage", "owner_notes", "last_contact_date", "relationship_read"] as const;
