import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily: pull fresh news for every account and re-score (so quiet accounts decay every day).
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scan = await runScan("cron-scan");
  return NextResponse.json(scan);
}
