"use client";

import { useMemo } from "react";
import { colors, radii } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { useTargets } from "@/lib/targets";
import { buildHeadline } from "@/lib/rolling-headline";

// Plain-English shape of the recent past. Pure rule-based, no LLM call —
// the actual rules live in lib/rolling-headline.ts so they can be tested
// in isolation. This component is just the presentation layer.
export function RollingHeadline({ aggregates }: { aggregates: DayAggregate[] }) {
  const targets = useTargets();
  const sentence = useMemo(
    () => buildHeadline(aggregates, targets),
    [aggregates, targets]
  );

  if (!sentence) return null;

  return (
    <div
      style={{
        padding: "16px 18px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.lg,
        fontSize: 16,
        lineHeight: 1.5,
        color: colors.text,
        letterSpacing: -0.1,
      }}
    >
      {sentence}
    </div>
  );
}
