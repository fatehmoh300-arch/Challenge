import test from "node:test";
import assert from "node:assert/strict";
import {
  isFastingDate,
  maxPointsForDate,
  pointsFromCompletions,
  isFullDay,
  maximumPointsForRange,
} from "../src/lib/scoring.js";

test("fasting eligibility is limited to Monday and Thursday", () => {
  assert.equal(isFastingDate("2026-11-30"), true);
  assert.equal(isFastingDate("2026-12-03"), true);
  assert.equal(isFastingDate("2026-12-01"), false);
  assert.equal(isFastingDate("2026-12-06"), false);
});

test("challenge point ceiling is calculated from its own configured goals", () => {
  const goals = [
    { id: "read", points: 3, is_active: true, is_required: true },
    { id: "walk", points: 2, is_active: true, is_required: true },
    { id: "fast", points: 1, is_active: true, is_required: false, is_fasting: true },
  ];
  assert.equal(maxPointsForDate("2026-12-01", goals), 5);
  assert.equal(maxPointsForDate("2026-12-03", goals), 6);
  assert.equal(maxPointsForDate("2026-12-03", goals.slice(0, 2)), 5);
});

test("inactive goals and goals outside their active dates do not add points", () => {
  const goals = [
    { id: "one", points: 4, is_active: false, is_required: true },
    { id: "two", points: 2, is_active: true, is_required: true, active_from: "2026-12-05" },
    { id: "three", points: 3, is_active: true, is_required: false, active_until: "2026-12-04" },
  ];
  assert.equal(maxPointsForDate("2026-12-04", goals), 3);
  assert.equal(maxPointsForDate("2026-12-05", goals), 2);
});

test("earned points use the point award frozen on each completion", () => {
  const completions = [
    { habit_id: "read", points_awarded: 3 },
    { habit_id: "walk", points_awarded: 2 },
  ];
  const goals = [
    { id: "read", points: 10 },
    { id: "walk", points: 1 },
  ];
  assert.equal(pointsFromCompletions(completions, goals), 5);
  assert.equal(pointsFromCompletions([], goals), 0);
});

test("a full day requires all required goals but not optional fasting", () => {
  const goals = [
    { id: "read", points: 2, is_active: true, is_required: true },
    { id: "walk", points: 1, is_active: true, is_required: true },
    { id: "fast", points: 1, is_active: true, is_required: false, is_fasting: true },
  ];
  assert.equal(isFullDay([{ habit_id: "read" }], goals, "2026-12-03"), false);
  assert.equal(isFullDay([{ habit_id: "read" }, { habit_id: "walk" }], goals, "2026-12-03"), true);
});

test("maximum range points are based on the configured challenge goals", () => {
  const goals = [
    { id: "a", points: 2, is_active: true, is_required: true },
    { id: "fast", points: 1, is_active: true, is_required: false, is_fasting: true },
  ];
  assert.equal(maximumPointsForRange("2026-11-30", "2026-12-01", goals), 5);
});
