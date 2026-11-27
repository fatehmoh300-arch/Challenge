export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type Challenge = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  timezone: string;
  reading_book: string;
  weekly_reading_goal: number;
  owner_user_id: string;
};

export type ChallengeHabit = {
  id: string;
  challenge_id: string;
  habit_key: "fajr" | "exercise" | "chess" | "project" | "reading" | "fasting";
  name: string;
  description: string;
  sort_order: number;
  is_fasting: boolean;
};

export type HabitCompletion = {
  habit_id: string;
  quantity: number;
  log_date: string;
};

export type DailyLog = {
  log_date: string;
  reviewed_at: string | null;
};

export type ReadingLog = {
  log_date: string;
  pages_read: number;
  book_title: string | null;
};

export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  possible_points: number;
  adherence_pct: number;
  full_days: number;
  habits_done: number;
  pages_read: number;
  best_streak: number;
};
