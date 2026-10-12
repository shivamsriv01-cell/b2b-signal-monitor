"use server";

import { revalidatePath } from "next/cache";
import { sendHotList } from "@/lib/hotlist";
import { runScan } from "@/lib/scan";
import { db, MANUAL_COLUMNS } from "@/lib/supabase";

/** Arjun's edits. Writes ONLY the manual columns — signal columns are never touched from here. */
export async function saveManualFields(formData: FormData) {
  const id = String(formData.get("id"));
  const patch: Record<string, string | null> = {};
  for (const col of MANUAL_COLUMNS) {
    if (!formData.has(col)) continue;
    const v = String(formData.get(col) ?? "").trim();
    patch[col] = v === "" ? null : v;
  }
  if (patch.stage === null) delete patch.stage;
  const { error } = await db().from("accounts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function scanNow() {
  const res = await runScan("manual");
  revalidatePath("/");
  return {
    accounts: res.accounts_scanned,
    articles: res.articles_fetched,
    newSignals: res.new_signals,
    errors: res.errors,
  };
}

export async function emailNow() {
  const res = await sendHotList();
  return res;
}
