"use client";

import { useSyncExternalStore } from "react";
import type { PendingTask } from "./types";

// Tiny module-level store for in-flight parse tasks. Lives outside any
// component tree so /log can fire a task and route home, with home's
// list re-rendering as the task progresses.
//
// Survives navigation within the SPA (Next.js client-side routes). A
// hard refresh wipes state — the task is still server-side in flight,
// but the pending card won't reappear. Acceptable trade for the
// simplicity of not stuffing File objects into sessionStorage.

let tasks: PendingTask[] = [];
const listeners = new Set<() => void>();

function emit() {
  // Reassign so identity check passes for React useSyncExternalStore
  tasks = [...tasks];
  for (const l of listeners) l();
}

export function addPendingTask(t: PendingTask) {
  tasks = [...tasks, t];
  for (const l of listeners) l();
}

export function updatePendingTask(
  id: string,
  fn: (t: PendingTask) => PendingTask
) {
  tasks = tasks.map((t) => (t.id === id ? fn(t) : t));
  for (const l of listeners) l();
}

export function removePendingTask(id: string) {
  const removed = tasks.find((t) => t.id === id);
  if (removed?.previewUrl) {
    try {
      URL.revokeObjectURL(removed.previewUrl);
    } catch {}
  }
  tasks = tasks.filter((t) => t.id !== id);
  for (const l of listeners) l();
}

export function getPendingTasksSnapshot(): PendingTask[] {
  return tasks;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePendingTasks(): PendingTask[] {
  return useSyncExternalStore(
    subscribe,
    () => tasks,
    () => tasks
  );
}

// Re-exported for completeness — keeps the unused-warning quiet if any
// internal helper is currently dormant.
export { emit as _internalEmit };
