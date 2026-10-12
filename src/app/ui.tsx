"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-sm self-start" disabled={pending}>
      {pending ? "Saving…" : "Save notes"}
    </button>
  );
}
