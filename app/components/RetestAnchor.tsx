"use client";

import { colors } from "@/lib/styles";
import { RETEST_DATE } from "@/lib/types";

// Gentle reminder of why this matters. No countdown urgency, no progress
// bar — just a quiet sentence about the anchor.
export function RetestAnchor() {
  const target = new Date(RETEST_DATE + "T00:00:00");
  const now = new Date();
  const days = Math.round((target.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (days < 0) return null;
  const weeks = Math.round(days / 7);

  let phrase: string;
  if (days <= 7) phrase = "this week";
  else if (days <= 14) phrase = "in a couple weeks";
  else if (weeks <= 6) phrase = `in ${weeks} weeks`;
  else if (weeks <= 12) phrase = `~${weeks} weeks out`;
  else phrase = `~${Math.round(weeks / 4.3)} months out`;

  return (
    <div
      style={{
        fontSize: 12,
        color: colors.textFaint,
        textAlign: "center",
        padding: "8px 0",
        letterSpacing: 0.2,
      }}
    >
      September retest {phrase}.
    </div>
  );
}
