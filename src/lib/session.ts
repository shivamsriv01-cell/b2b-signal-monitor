// Edge-safe helpers shared by middleware and the login action.
export const SESSION_COOKIE = "sm_session";

/** The cookie value for a valid session: a hash of the dashboard password, never the password itself. */
export async function sessionToken(password: string) {
  const data = new TextEncoder().encode(`signal-monitor:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
