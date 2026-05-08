"use client";

import { useEffect, useState } from "react";
import { TARGETS as DEFAULT_TARGETS } from "./types";

export type Targets = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
};

const STORAGE_KEY = "eats:targets:v1";

// Single-user app, no need for a server-side prefs table yet — localStorage
// is fine. We expose a hook that hydrates on mount and a setter that
// dispatches a custom event so other component instances stay in sync.

function readStorage(): Targets {
  if (typeof window === "undefined") return DEFAULT_TARGETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TARGETS;
    const parsed = JSON.parse(raw) as Partial<Targets>;
    return {
      sat_fat_g: numOr(parsed.sat_fat_g, DEFAULT_TARGETS.sat_fat_g),
      soluble_fiber_g: numOr(parsed.soluble_fiber_g, DEFAULT_TARGETS.soluble_fiber_g),
      calories: numOr(parsed.calories, DEFAULT_TARGETS.calories),
      protein_g: numOr(parsed.protein_g, DEFAULT_TARGETS.protein_g),
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

const EVENT_NAME = "eats:targets:changed";

export function useTargets(): Targets {
  // Start with defaults so SSR doesn't flicker; hydrate from storage in effect.
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);

  useEffect(() => {
    setTargets(readStorage());
    const handler = () => setTargets(readStorage());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler); // sync across tabs
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return targets;
}

export function saveTargets(t: Targets) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function resetTargets() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export { DEFAULT_TARGETS };
