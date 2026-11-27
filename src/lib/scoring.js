/** Date-only values are interpreted in UTC at midday to avoid timezone drift. */
export function isFastingDate(value) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return day === 1 || day === 4;
}

export function isGoalActiveOnDate(goal, value) {
  // is_active describes the current/future state. A deactivated goal with an
  // active_until date remains part of historical calculations before that date.
  if (goal.is_active === false && !goal.active_until) return false;
  if (goal.active_from && value < goal.active_from) return false;
  if (goal.active_until && value > goal.active_until) return false;
  if (goal.is_fasting && !isFastingDate(value)) return false;
  return true;
}

/** Maximum available points come from the challenge's own active goals. */
export function maxPointsForDate(value, goals = []) {
  return goals
    .filter((goal) => isGoalActiveOnDate(goal, value))
    .reduce((total, goal) => total + Number(goal.points || 0), 0);
}

/** Sum only the frozen points stored on each completion record. */
export function pointsFromCompletions(completions = []) {
  if (!Array.isArray(completions)) return 0;
  return completions.reduce(
    (total, completion) => total + Number(completion.points_awarded ?? 0),
    0,
  );
}

/** A full day requires every configured required goal active on that date. */
export function isFullDay(completions = [], goals = [], value) {
  const required = goals.filter(
    (goal) => goal.is_required && isGoalActiveOnDate(goal, value),
  );
  if (required.length === 0) return false;
  const completedIds = new Set(completions.map((row) => row.habit_id));
  return required.every((goal) => completedIds.has(goal.id));
}

/** Sum the possible points from the selected challenge's goal definitions. */
export function maximumPointsForRange(start, end, goals = []) {
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  let total = 0;
  while (cursor <= last) {
    total += maxPointsForDate(cursor.toISOString().slice(0, 10), goals);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}


/**
 * Apply deterministic competition ranks to a leaderboard sorted by score.
 * Equal points share a rank and the next rank skips tied places (1, 1, 3).
 * Display name and user id order only make the visible list stable; neither
 * decides who receives a tied award.
 */
export function assignCompetitionRanks(entries = []) {
  const ordered = [...entries].sort((left, right) => {
    const scoreDifference = Number(right.points || 0) - Number(left.points || 0);
    if (scoreDifference !== 0) return scoreDifference;
    const nameOrder = String(left.display_name || "").localeCompare(
      String(right.display_name || ""),
      "ar",
    );
    if (nameOrder !== 0) return nameOrder;
    return String(left.user_id || "").localeCompare(String(right.user_id || ""));
  });

  let previousPoints = null;
  let previousRank = 0;
  return ordered.map((entry, index) => {
    const points = Number(entry.points || 0);
    const competitionRank = index === 0 || points !== previousPoints
      ? index + 1
      : previousRank;
    previousPoints = points;
    previousRank = competitionRank;
    return { ...entry, competition_rank: competitionRank };
  });
}
