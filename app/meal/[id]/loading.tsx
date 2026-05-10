import { Block } from "@/app/components/Skeleton";
import { colors, radii } from "@/lib/styles";

// Streamed instantly by Next.js while the server component for
// /meal/[id] awaits the DB query. Without this, tapping a card on home
// felt frozen for a beat. Layout mirrors edit-page so the swap-in is
// quiet — same sticky header band, same photo block, same item rows.
export default function Loading() {
  return (
    <main style={{ maxWidth: 540, margin: "0 auto", minHeight: "100vh" }}>
      <header
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          position: "sticky",
          top: 0,
          background: colors.bg,
          zIndex: 10,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div
          aria-hidden
          style={{
            color: colors.textMuted,
            fontSize: 22,
            padding: 6,
          }}
        >
          ‹
        </div>
        <div style={{ flex: 1 }}>
          <Block width={70} height={11} radius="pill" />
        </div>
        <Block width={48} height={20} radius="pill" />
      </header>

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
        role="status"
        aria-label="loading meal"
      >
        <Block height={260} radius={radii.md} />
        <Block height={14} width="55%" radius="pill" />
        <Block height={92} radius={radii.md} />
        <Block height={92} radius={radii.md} />
        <Block height={92} radius={radii.md} />
      </div>
    </main>
  );
}
