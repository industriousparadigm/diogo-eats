"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { colors } from "@/lib/styles";

// Magic-link sign-in / sign-up. One field (email), one button.
// Submitting calls /api/auth/magic-link which checks the allowlist and
// then asks Supabase to send the email. If accepted, we show a confirm
// screen; if rejected, an error.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const fromError = params?.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setState("error");
        setError(j.error ?? "couldn't send link");
        return;
      }
      setState("sent");
    } catch (err: any) {
      setState("error");
      setError(err?.message ?? "network error");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: colors.bg,
        color: colors.text,
      }}
    >
      <div style={{ maxWidth: 380, width: "100%" }}>
        <h1
          style={{
            fontSize: 18,
            letterSpacing: 3,
            fontWeight: 600,
            margin: 0,
            marginBottom: 6,
            textAlign: "center",
          }}
        >
          EATS
        </h1>
        <p
          style={{
            fontSize: 13,
            color: colors.textMuted,
            textAlign: "center",
            margin: 0,
            marginBottom: 28,
          }}
        >
          Personal food log
        </p>

        {fromError && state === "idle" && (
          <div
            style={{
              background: "#7f1d1d",
              padding: 10,
              borderRadius: 8,
              marginBottom: 14,
              fontSize: 13,
              color: "#fee2e2",
            }}
          >
            {fromError === "callback_failed"
              ? "That magic link didn't work — try again."
              : "Sign-in error: " + fromError}
          </div>
        )}

        {state === "sent" ? (
          <div
            style={{
              padding: 16,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 10,
              fontSize: 14,
              lineHeight: 1.5,
              color: colors.textMuted,
            }}
          >
            Check your inbox for a sign-in link sent to{" "}
            <strong style={{ color: colors.text }}>{email}</strong>. Tap it
            on this device to come back signed in.
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => {
                  setState("idle");
                  setEmail("");
                }}
                style={linkButtonStyle}
              >
                use a different email
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <label
              style={{
                fontSize: 11,
                color: colors.textSubtle,
                letterSpacing: 0.5,
              }}
            >
              EMAIL
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                background: colors.surfaceMuted,
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: 8,
                color: colors.text,
                padding: "12px 14px",
                fontSize: 16,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={state === "sending" || !email.trim()}
              style={{
                background: state === "sending" ? "#3f3f46" : "#65a30d",
                color: "#fff",
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 8,
                border: "none",
                marginTop: 4,
                cursor: state === "sending" ? "default" : "pointer",
              }}
            >
              {state === "sending" ? "sending…" : "send me a magic link"}
            </button>
            {state === "error" && error && (
              <div
                style={{
                  fontSize: 12,
                  color: "#fca5a5",
                  marginTop: 4,
                }}
              >
                {error}
              </div>
            )}
            <p
              style={{
                fontSize: 11,
                color: colors.textFaint,
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              No password. You'll get a one-time link in your inbox to
              sign in. Eats is invite-only right now — if you weren't
              invited, the link won't send.
            </p>
          </form>
        )}
      </div>
      {/* router prop intentionally unused — kept for future post-send redirect. */}
      {void router}
    </main>
  );
}

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: colors.textMuted,
  border: "none",
  padding: 0,
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "underline",
};
