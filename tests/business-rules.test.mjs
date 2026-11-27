import test from "node:test";
import assert from "node:assert/strict";
import { isFastingDate, maxPointsForDate, pointsFromCompletions, maximumPointsForRange } from "../src/lib/scoring.js";

test("fasting eligibility is limited to Monday and Thursday", () => {
  assert.equal(isFastingDate("2026-12-07"), true);
  assert.equal(isFastingDate("2026-12-10"), true);
  assert.equal(isFastingDate("2026-12-08"), false);
  assert.equal(isFastingDate("2026-12-13"), false);
});

test("December 2026 has nine fasting days and 164 maximum points", () => {
  const fastingDays = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`).filter(isFastingDate);
  assert.equal(fastingDays.length, 9);
  assert.equal(maximumPointsForRange("2026-12-01", "2026-12-31"), 164);
});

test("the point ceiling is five normally and six on fasting days", () => {
  assert.equal(maxPointsForDate("2026-12-08"), 5);
  assert.equal(maxPointsForDate("2026-12-10"), 6);
});

test("points count recorded completion entries only", () => {
  assert.equal(pointsFromCompletions([{ habit_id: "a" }, { habit_id: "b" }]), 2);
  assert.equal(pointsFromCompletions([]), 0);
});
