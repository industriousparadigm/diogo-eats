"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { colors } from "@/lib/styles";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { PrimaryButton, SecondaryButton, SheetShell } from "./sheet";

// Account state lives here. When signed in: show email + sign-out.
// When signed out: show sign-in CTA. Auth state is read on the
// client via the Supabase browser client (it shares cookies with the
// SSR session).
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  // undefined = loading, null = no session, string = signed in
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
      // Also clear client-side cache.
      const supa = getSupabaseBrowser();
      await supa.auth.signOut().catch(() => {});
      onClose();
      router.refresh();
      router.push("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetShell onScrimClick={onClose}>
      <div style={{ fontSize: 12, color: colors.textSubtle, letterSpacing: 0.5 }}>
        ACCOUNT
      </div>

      {email === undefined ? (
        <div style={{ fontSize: 13, color: colors.textFaint }}>loading…</div>
      ) : email === null ? (
        <>
          <div
            style={{
              fontSize: 14,
              color: colors.text,
              lineHeight: 1.5,
              padding: "4px 0",
            }}
          >
            You're not signed in. Eats is invite-only; if you were
            invited, sign in with the magic-link flow.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SecondaryButton onClick={onClose}>close</SecondaryButton>
            <PrimaryButton
              onClick={() => {
                onClose();
                router.push("/login");
              }}
              flex
            >
              sign in
            </PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 14,
              color: colors.text,
              lineHeight: 1.5,
              padding: "4px 0",
            }}
          >
            Signed in as{" "}
            <span style={{ color: colors.accentBright, fontWeight: 500 }}>
              {email}
            </span>
            .
          </div>
          <div
            style={{
              fontSize: 12,
              color: colors.textMuted,
              lineHeight: 1.5,
            }}
          >
            Single-user storage right now — your meals live in Supabase
            (DiogoEats project). Per-user isolation lands in the next
            phase.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SecondaryButton onClick={onClose}>close</SecondaryButton>
            <PrimaryButton onClick={onSignOut} disabled={busy} flex>
              {busy ? "signing out…" : "sign out"}
            </PrimaryButton>
          </div>
        </>
      )}
    </SheetShell>
  );
}
