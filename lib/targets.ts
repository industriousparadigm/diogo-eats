"use client";

import { useEffect, useState } from "react";
import { TARGETS as DEFAULT_TARGETS } from "./types";

export type Targets = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
};

// Per-user targets, sourced from /api/profile (the user_profiles
// table). Previous versions used localStorage; that's gone now —
// targets travel with the user across devices.
//
// Hook returns DEFAULT_TARGETS during the brief fetch so SSR/initial
// render isn't a flicker. Save/reset trigger a refetch via custom
// event so all consumers stay in sync.

const EVENT_NAME = "eats:targets:changed";

async function fetchTargets(): Promise<Targets> {
  try {
    const r = await fetch("/api/profile", { credentials: "same-origin" });
    if (!r.ok) return DEFAULT_TARGETS;
    const j = (await r.json()) as { profile?: Targets };
    if (!j.profile) return DEFAULT_TARGETS;
    return {
      sat_fat_g: numOr(j.profile.sat_fat_g, DEFAULT_TARGETS.sat_fat_g),
      soluble_fiber_g: numOr(j.profile.soluble_fiber_g, DEFAULT_TARGETS.soluble_fiber_g),
      calories: numOr(j.profile.calories, DEFAULT_TARGETS.calories),
      protein_g: numOr(j.profile.protein_g, DEFAULT_TARGETS.protein_g),
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

export function useTargets(): Targets {
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);

  useEffect(() => {
    let alive = true;
    fetchTargets().then((t) => {
      if (alive) setTargets(t);
    });
    const handler = () => {
      fetchTargets().then((t) => {
        if (alive) setTargets(t);
      });
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => {
      alive = false;
      window.removeEventListener(EVENT_NAME, handler);
    };
  }, []);

  return targets;
}

export async function saveTargets(t: Targets): Promise<void> {
  try {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
  } finally {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENT_NAME));
    }
  }
}

export async function resetTargets(): Promise<void> {
  // Re-apply the defaults via the same endpoint so the DB row reflects
  // the user's intent rather than orphaning a stale row.
  await saveTargets(DEFAULT_TARGETS);
}

export { DEFAULT_TARGETS };
