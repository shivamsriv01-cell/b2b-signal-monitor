import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendHotList } from "@/lib/hotlist";
import { runScan } from "@/lib/scan";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Monday + Thursday mornings: scan, then email the Hot List.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scan = await runScan("cron-hotlist");
  const email = await sendHotList();
  if (scan.runId) await db().from("scan_runs").update({ email_sent: true }).eq("id", scan.runId);
  return NextResponse.json({ scan, email });
}
