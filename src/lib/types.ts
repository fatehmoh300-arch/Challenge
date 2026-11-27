export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type Challenge = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  visibility: "public" | "private";
  status: string;
  join_mode: "open" | "approval" | "invite";
  max_members: number;
  member_count: number;
  start_date: string;
  end_date: string;
  timezone: string;
  reading_book: string;
  weekly_reading_goal: number;
  owner_user_id: string;
};

export type ChallengeMembership = {
  challenge_id: string;
  user_id: string;
  role: "owner" | "moderator" | "assistant" | "member";
  permissions: string[];
  created_at: string;
};

export type ChallengeHabit = {
  id: string;
  challenge_id: string;
  habit_key: string;
  name: string;
  description: string;
  sort_order: number;
  is_fasting: boolean;
  points: number;
  is_required: boolean;
  is_active: boolean;
  active_from: string;
  active_until: string | null;
};

export type HabitCompletion = {
  habit_id: string;
  quantity: number;
  points_awarded: number;
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

export type MyProgress = {
  xp: number;
  completed_tasks: number;
  active_days: number;
  pages_read: number;
  best_streak: number;
  achievements: { key: string; earned_at: string }[];
};

export type ChallengePost = {
  id: string;
  challenge_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type ChallengeComment = {
  id: string;
  post_id: string;
  challenge_id: string;
  author_id: string;
  content: string;
  created_at: string;
};
