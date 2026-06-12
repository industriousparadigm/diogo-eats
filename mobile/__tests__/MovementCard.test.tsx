// MovementCard — the image-led timeline cards. Asserts the gym SessionCard
// (Gym name + beats badge + exercise names) and the ActivityCard (type name,
// "type · label" subtitle, the duration numeral, the effort + distance chips,
// and distance hidden for non-distance types).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { SessionCard, ActivityCard } from "../components/MovementCard";
import type { SessionSummary } from "../lib/strengthTypes";
import type { Activity } from "../lib/activityTypes";

function session(beats: number): SessionSummary {
  return {
    id: "s1",
    started_at: new Date(2026, 5, 10, 17).getTime(),
    completed_at: new Date(2026, 5, 10, 18).getTime(),
    note: null,
    exercise_ids: ["leg-press", "chest-press"],
    beats_count: beats,
  };
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    type: "padel",
    label: "class",
    started_at: new Date(2026, 5, 11, 11).getTime(),
    duration_min: 90,
    effort: "light",
    distance_km: null,
    note: null,
    source: "manual",
    external_id: null,
    created_at: Date.now(),
    ...overrides,
  };
}

describe("SessionCard", () => {
  it("renders Gym, the exercise names, and a beats badge; tap fires onPress", async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      <SessionCard
        session={session(3)}
        exerciseNames={["Leg press", "Chest press"]}
        onPress={onPress}
      />
    );
    expect(getByText("Gym")).toBeTruthy();
    expect(getByText("Leg press · Chest press")).toBeTruthy();
    expect(getByText("3 beats")).toBeTruthy();
    fireEvent.press(getByText("Gym"));
    expect(onPress).toHaveBeenCalled();
  });

  it("shows a singular 'beat' at exactly 1 and a neutral 0", async () => {
    const one = await render(
      <SessionCard session={session(1)} exerciseNames={["Leg press"]} onPress={jest.fn()} />
    );
    expect(one.getByText("1 beat")).toBeTruthy();
    const zero = await render(
      <SessionCard session={session(0)} exerciseNames={["Leg press"]} onPress={jest.fn()} />
    );
    expect(zero.getByText("0 beats")).toBeTruthy();
  });
});

describe("ActivityCard", () => {
  it("renders the type name, subtitle, duration, effort and (no) distance for padel", async () => {
    const { getByText, queryByText } = await render(
      <ActivityCard activity={activity()} onPress={jest.fn()} />
    );
    expect(getByText("Padel")).toBeTruthy();
    expect(getByText("padel · class")).toBeTruthy();
    expect(getByText("90")).toBeTruthy(); // the duration numeral
    expect(getByText("felt: light")).toBeTruthy();
    // Padel is not distance-y — no km chip even if a value were present.
    expect(queryByText(/km/)).toBeNull();
  });

  it("shows a distance chip for a distance-y type with a value", async () => {
    const { getByText } = await render(
      <ActivityCard activity={activity({ type: "run", distance_km: 5.2 })} onPress={jest.fn()} />
    );
    expect(getByText("Run")).toBeTruthy();
    expect(getByText("5.2 km")).toBeTruthy();
  });

  it("renders an UNKNOWN type with the dignified default name", async () => {
    const { getByText } = await render(
      <ActivityCard activity={activity({ type: "kayak", label: null })} onPress={jest.fn()} />
    );
    expect(getByText("Kayak")).toBeTruthy();
  });

  it("fires onPress when tapped", async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<ActivityCard activity={activity()} onPress={onPress} />);
    fireEvent.press(getByText("Padel"));
    expect(onPress).toHaveBeenCalled();
  });
});
