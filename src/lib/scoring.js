/** Return true only for Monday (ISO day 1) or Thursday (ISO day 4) in a date-only value. */
export function isFastingDate(value) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return day === 1 || day === 4;
}

/** Five fixed habits plus the fasting point on eligible weekdays. */
export function maxPointsForDate(value) {
  return 5 + (isFastingDate(value) ? 1 : 0);
}

/** Count persisted completion rows; the database enforces uniqueness per habit/day. */
export function pointsFromCompletions(completions) {
  return Array.isArray(completions) ? completions.length : 0;
}

/** Calculate the maximum number of monthly points for a date range. */
export function maximumPointsForRange(start, end) {
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  let total = 0;
  while (cursor <= last) {
    total += maxPointsForDate(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}
