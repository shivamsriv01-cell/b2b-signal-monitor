import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/session";

async function login(formData: FormData) {
  "use server";
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  if (String(formData.get("password") ?? "") !== password) redirect("/login?error=1");
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="wrap flex min-h-[70vh] items-center justify-center">
      <form action={login} className="card flex w-full max-w-sm flex-col gap-3">
        <h1 className="title">Account Signal Monitor</h1>
        <p className="text-sm text-[var(--muted)]">Arjun&apos;s private dashboard. Enter the password to continue.</p>
        <input type="password" name="password" placeholder="Password" autoFocus required className="field" />
        {error && <p className="text-sm text-[var(--hot-fg)]">Wrong password.</p>}
        <button className="btn btn-primary">Sign in</button>
      </form>
    </main>
  );
}
