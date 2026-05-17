import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · Eats",
  description: "How Eats handles your data.",
};

// Privacy policy. Plain English. Public route — no auth gate, no
// middleware redirect (matched in middleware.ts PUBLIC_UI_PATHS).
export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 720,
        margin: "0 auto",
        padding: "32px 20px 64px",
        color: "#e4e4e7",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 22, letterSpacing: 3, margin: 0, marginBottom: 6 }}>
        EATS · PRIVACY
      </h1>
      <p style={{ color: "#a1a1aa", margin: 0, marginBottom: 32, fontSize: 13 }}>
        Last updated: 17 May 2026
      </p>

      <Section title="What this is">
        <p>
          Eats is a personal food-logging app built by Diogo Costa. It's
          invite-only and small — fewer than a handful of users at the
          time of writing. This page describes what the app does with
          your data, in plain English. If something here isn't clear,
          email{" "}
          <a href="mailto:dsgmcosta@gmail.com" style={linkStyle}>
            dsgmcosta@gmail.com
          </a>
          .
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account</strong>: your email address, used only to
            sign you in via magic link. We never send marketing email.
          </li>
          <li>
            <strong>Profile</strong>: optional onboarding inputs you
            choose to share — sex, age, weight, free-form notes about
            goals or conditions. Used to compute your starter daily
            targets.
          </li>
          <li>
            <strong>Meals</strong>: photos you upload, captions you
            type, parsed item lists, and per-meal nutrition (calories,
            protein, fat, carbs, fiber, alcohol).
          </li>
          <li>
            <strong>Whoop data (optional, only if you connect)</strong>:
            daily strain, recovery, HRV, resting heart rate, sleep
            summary, and per-workout sport / strain / calories /
            heart-rate zones. We do <em>not</em> store minute-by-minute
            heart-rate streams.
          </li>
        </ul>
      </Section>

      <Section title="Where it lives">
        <ul>
          <li>
            <strong>Database + photos</strong>: Supabase (Diogo's
            personal Supabase project, region eu-west-1). Photos sit in
            a private storage bucket; access requires a short-lived
            signed URL that only the photo's owner can request.
          </li>
          <li>
            <strong>App hosting</strong>: Vercel (Diogo's personal
            Vercel scope <code style={codeStyle}>dsgmcostas-projects</code>).
          </li>
          <li>
            <strong>Backups</strong>: daily JSON snapshots written to
            Vercel Blob with 90-day retention. Only Diogo can list or
            download them (gated by a server-side secret).
          </li>
        </ul>
      </Section>

      <Section title="What we send to third parties">
        <ul>
          <li>
            <strong>Anthropic (Claude)</strong>: meal photos and captions
            are sent to Claude for nutrition parsing. Anthropic's
            policies apply to that round-trip — see their{" "}
            <a
              href="https://www.anthropic.com/legal/privacy"
              style={linkStyle}
              target="_blank"
              rel="noreferrer"
            >
              privacy policy
            </a>
            . Onboarding inputs are also sent to Claude once when you
            sign up so it can compute your starter targets.
          </li>
          <li>
            <strong>Supabase</strong>: stores meals, profile, and Whoop
            data on your behalf — see{" "}
            <a
              href="https://supabase.com/privacy"
              style={linkStyle}
              target="_blank"
              rel="noreferrer"
            >
              Supabase's privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Vercel</strong>: hosts the app and the backup
            storage — see{" "}
            <a
              href="https://vercel.com/legal/privacy-policy"
              style={linkStyle}
              target="_blank"
              rel="noreferrer"
            >
              Vercel's privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Whoop</strong>: if you connect Whoop, the app uses
            their OAuth-based developer API to read your training data.
            We follow{" "}
            <a
              href="https://developer.whoop.com/api-terms-of-use/"
              style={linkStyle}
              target="_blank"
              rel="noreferrer"
            >
              Whoop's developer terms
            </a>{" "}
            — your Whoop data is cached for the app's use only, never
            resold or shared, and you can disconnect at any time.
          </li>
        </ul>
        <p>
          We do not sell, rent, or share your data with anyone outside
          the providers above. There is no advertising, no analytics
          beyond Vercel's standard request logs, no trackers.
        </p>
      </Section>

      <Section title="Your rights">
        <ul>
          <li>
            <strong>Access</strong>: every meal and metric you've logged
            is visible to you inside the app. The "copy day" button on
            the home page exports a markdown report.
          </li>
          <li>
            <strong>Deletion</strong>: tap a meal → delete to remove it.
            To delete your entire account, email Diogo and he'll cascade
            it (this removes meals, profile, Whoop data, photos, and
            the auth row).
          </li>
          <li>
            <strong>Disconnect Whoop</strong>: Settings → Integrations →
            Disconnect. This revokes the OAuth token and stops
            future syncs. Cached cycles/workouts remain unless you also
            ask for full deletion.
          </li>
        </ul>
      </Section>

      <Section title="Changes">
        <p>
          When this policy changes meaningfully, the date at the top
          updates and the change goes in the repo's commit history at
          {" "}
          <a
            href="https://github.com/industriousparadigm/diogo-eats"
            style={linkStyle}
            target="_blank"
            rel="noreferrer"
          >
            github.com/industriousparadigm/diogo-eats
          </a>
          .
        </p>
      </Section>

      <Section title="Contact">
        <p>
          <a href="mailto:dsgmcosta@gmail.com" style={linkStyle}>
            dsgmcosta@gmail.com
          </a>
        </p>
      </Section>
    </main>
  );
}

const linkStyle: React.CSSProperties = {
  color: "#bef264",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

const codeStyle: React.CSSProperties = {
  background: "#18181b",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontSize: 13,
          letterSpacing: 1.5,
          color: "#71717a",
          fontWeight: 500,
          margin: 0,
          marginBottom: 12,
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, color: "#d4d4d8" }}>{children}</div>
    </section>
  );
}
