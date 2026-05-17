"use client";

import { colors } from "@/lib/styles";
import { SecondaryButton, SheetShell } from "./sheet";

// Placeholder for the upcoming account / login work. The Topbar's
// person icon opens this — it's intentionally honest about state
// rather than pretending to be a half-built menu.
export function AccountSheet({ onClose }: { onClose: () => void }) {
  return (
    <SheetShell onScrimClick={onClose}>
      <div style={{ fontSize: 12, color: colors.textSubtle, letterSpacing: 0.5 }}>
        ACCOUNT
      </div>
      <div
        style={{
          fontSize: 14,
          color: colors.text,
          lineHeight: 1.5,
          padding: "4px 0",
        }}
      >
        Single user right now. Diogo's eats live in the Supabase project
        <code style={codeStyle}>DiogoEats</code> under his personal Supabase
        account.
      </div>
      <div
        style={{
          fontSize: 13,
          color: colors.textMuted,
          lineHeight: 1.5,
        }}
      >
        Login + multi-user is on the roadmap. When it lands, this sheet
        becomes the place to switch accounts, manage sessions, and sign
        out.
      </div>
      <div style={{ display: "flex" }}>
        <SecondaryButton onClick={onClose}>close</SecondaryButton>
      </div>
    </SheetShell>
  );
}

const codeStyle: React.CSSProperties = {
  background: colors.surfaceMuted,
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 12,
  margin: "0 4px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
