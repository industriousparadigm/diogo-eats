import Link from "next/link";
import { colors } from "@/lib/styles";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, color: colors.textMuted }}>Meal not found.</div>
      <Link
        href="/"
        style={{
          background: colors.accent,
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 8,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        back
      </Link>
    </main>
  );
}
