import "server-only";
import { Resend } from "resend";
import { HOTLIST_SIZE, HOTLIST_WINDOW_DAYS, MIN_TRIGGER_STRENGTH } from "./config";
import { db, type Account, type Signal } from "./supabase";

export type HotEntry = { account: Account; signals: Signal[] };

/** The ten accounts with the strongest signals from the last three days. */
export async function buildHotList(): Promise<HotEntry[]> {
  const { data: accounts } = await db()
    .from("accounts")
    .select("*")
    .gt("hot_score_3d", 0)
    .order("hot_score_3d", { ascending: false })
    .limit(HOTLIST_SIZE);
  if (!accounts?.length) return [];

  const since = new Date(Date.now() - HOTLIST_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: signals } = await db()
    .from("signals")
    .select("*")
    .in("account_id", accounts.map((a) => a.id))
    .gte("strength", MIN_TRIGGER_STRENGTH)
    .gte("published_at", since)
    .order("strength", { ascending: false });

  return (accounts as Account[]).map((account) => ({
    account,
    signals: ((signals ?? []) as Signal[]).filter((s) => s.account_id === account.id).slice(0, 3),
  }));
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHotListEmail(list: HotEntry[], appUrl?: string) {
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const rows = list
    .map(({ account: a, signals }, i) => {
      const sources = signals
        .map((s) => `<a href="${esc(s.url)}" style="color:#2563eb">${esc(s.source ?? "source")}</a>`)
        .join(" · ");
      const lastContact = a.last_contact_date ? `last contact ${a.last_contact_date}` : "never contacted";
      return `
      <tr><td style="padding:16px 0;border-bottom:1px solid #e5e7eb">
        <div style="font-size:16px;font-weight:600;color:#111827">${i + 1}. ${esc(a.name)}
          <span style="font-weight:400;color:#6b7280;font-size:13px">· ${esc(a.stage)} · ${lastContact}</span>
          <span style="float:right;background:#fee2e2;color:#b91c1c;border-radius:10px;padding:2px 8px;font-size:12px">${Math.round(a.hot_score_3d)}</span>
        </div>
        <div style="margin-top:6px;color:#111827;font-size:14px"><b>Signal:</b> ${esc(a.signal_summary)}</div>
        <div style="margin-top:6px;color:#374151;font-size:14px;background:#f9fafb;border-left:3px solid #2563eb;padding:8px 10px"><b>Angle:</b> ${esc(a.outreach_angle)}</div>
        <div style="margin-top:6px;font-size:12px;color:#6b7280">${sources}</div>
      </td></tr>`;
    })
    .join("");

  const body = list.length
    ? `<table style="width:100%;border-collapse:collapse">${rows}</table>`
    : `<p style="color:#374151">No account has a fresh trigger in the last ${HOTLIST_WINDOW_DAYS} days. Nothing worth interrupting anyone for — good week to nurture existing pilots.</p>`;

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
    <h1 style="font-size:20px;margin:0">🔥 Hot List — ${esc(date)}</h1>
    <p style="color:#6b7280;font-size:14px;margin:4px 0 16px">Accounts with the strongest trigger signals from the last ${HOTLIST_WINDOW_DAYS} days.</p>
    ${body}
    ${appUrl ? `<p style="margin-top:20px;font-size:13px"><a href="${esc(appUrl)}" style="color:#2563eb">Open the dashboard →</a></p>` : ""}
  </body></html>`;

  const text = list.length
    ? list
        .map(({ account: a }, i) => `${i + 1}. ${a.name} (${a.stage}, score ${Math.round(a.hot_score_3d)})\n   Signal: ${a.signal_summary}\n   Angle: ${a.outreach_angle}`)
        .join("\n\n")
    : `No account has a fresh trigger in the last ${HOTLIST_WINDOW_DAYS} days.`;

  return { subject: `Hot List · ${list.length} warm account${list.length === 1 ? "" : "s"} · ${date}`, html, text };
}

export async function sendHotList() {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.HOTLIST_TO_EMAIL;
  if (!key || !to) throw new Error("RESEND_API_KEY and HOTLIST_TO_EMAIL must be set");

  const list = await buildHotList();
  const appUrl = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  const email = renderHotListEmail(list, appUrl);

  const { data, error } = await new Resend(key).emails.send({
    from: process.env.HOTLIST_FROM_EMAIL ?? "Signal Monitor <onboarding@resend.dev>",
    to: to.split(",").map((s) => s.trim()),
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id, accounts: list.length };
}
