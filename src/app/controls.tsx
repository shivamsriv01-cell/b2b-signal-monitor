"use client";

import { useState, useTransition } from "react";
import { emailNow, scanNow } from "./actions";

export function Controls() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg("Scanning live news for every account… (≈1 min)");
              try {
                const r = await scanNow();
                setMsg(
                  `Scanned ${r.accounts} accounts · ${r.articles} articles · ${r.newSignals} new triggers` +
                    (r.errors.length
                      ? ` · ${r.errors.length} error(s): ${r.errors.map((e) => e.account).join(", ")}`
                      : ""),
                );
              } catch (e) {
                setMsg(`Scan failed: ${(e as Error).message}`);
              }
            })
          }
          className="btn btn-primary"
        >
          Scan now
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg("Sending Hot List email…");
              try {
                const r = await emailNow();
                setMsg(`Hot List sent with ${r.accounts} account(s).`);
              } catch (e) {
                setMsg(`Email failed: ${(e as Error).message}`);
              }
            })
          }
          className="btn"
        >
          Send Hot List now
        </button>
      </div>
      {msg && <span className="meta max-w-sm md:text-right">{msg}</span>}
    </div>
  );
}
