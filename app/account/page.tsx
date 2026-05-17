"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { colors } from "@/lib/styles";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

// Account as its own page. Was a modal sheet that obscured the page
// behind it; now a proper screen with a back arrow.
export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supa = getSupabaseBrowser();
    let alive = true;
    supa.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setEmail(data?.user?.email ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onSignOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      const supa = getSupabaseBrowser();
      await supa.auth.signOut().catch(() => {});
      router.push("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 540,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="back"
          style={{
            background: "transparent",
            color: colors.textMuted,
            fontSize: 22,
            padding: 6,
            borderRadius: 6,
          }}
        >
          ‹
        </button>
        <div
          style={{
            flex: 1,
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 0.5,
            textAlign: "center",
          }}
        >
          ACCOUNT
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {email === undefined ? (
          <div style={{ fontSize: 13, color: colors.textFaint }}>loading…</div>
        ) : email === null ? (
          <>
            <div
              style={{
                fontSize: 15,
                color: colors.text,
                lineHeight: 1.5,
              }}
            >
              You're not signed in. Eats is invite-only; if you were
              invited, sign in with the magic-link flow.
            </div>
            <button
              onClick={() => router.push("/login")}
              style={{
                background: colors.accent,
                color: "#fff",
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
              }}
            >
              sign in
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 12,
                color: colors.textSubtle,
                letterSpacing: 0.5,
              }}
            >
              SIGNED IN AS
            </div>
            <div
              style={{
                fontSize: 18,
                color: colors.accentBright,
                fontWeight: 500,
                wordBreak: "break-all",
              }}
            >
              {email}
            </div>
            <div
              style={{
                fontSize: 13,
                color: colors.textMuted,
                lineHeight: 1.6,
              }}
            >
              Your meals live in Supabase (DiogoEats project). Per-user
              data isolation lands in the next phase — for now everyone
              signed in shares the same dataset.
            </div>
            <button
              onClick={onSignOut}
              disabled={busy}
              style={{
                background: "transparent",
                color: colors.text,
                padding: "12px 16px",
                fontSize: 14,
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: 8,
                cursor: busy ? "default" : "pointer",
                marginTop: 8,
              }}
            >
              {busy ? "signing out…" : "sign out"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
