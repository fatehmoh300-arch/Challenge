-- CHALLENGE P0 hardening: least-privilege table access, challenge-scoped comments,
-- separated lifecycle authority, announcement authorization and fair tied awards.
-- Additive/data-preserving: no user, challenge, progress or invitation rows are deleted.

-- Refuse to add the cross-challenge invariant if legacy data needs manual repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.challenge_comments AS cc
    JOIN public.challenge_posts AS cp ON cp.id = cc.post_id
    WHERE cc.challenge_id <> cp.challenge_id
  ) THEN
    RAISE EXCEPTION
      'Cannot add challenge comment/post integrity constraint: mismatched legacy rows exist; repair them explicitly first';
  END IF;
END
$$;

-- CH-SEC-01: remove broad privileges (including TRUNCATE, TRIGGER and REFERENCES)
-- and retain only the reads and two legacy settings updates used by the client.
REVOKE ALL PRIVILEGES ON TABLE public.challenges FROM authenticated;

DO $$
DECLARE
  column_row RECORD;
BEGIN
  FOR column_row IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'challenges'
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.challenges FROM authenticated',
      column_row.column_name
    );
  END LOOP;
END
$$;

GRANT SELECT ON TABLE public.challenges TO authenticated;
GRANT UPDATE (reading_book, weekly_reading_goal)
  ON TABLE public.challenges TO authenticated;

-- CH-SEC-02: enforce that each comment and its referenced post belong to
-- the same challenge. The restrictive policy composes with the existing
-- member/author policy without opening a permissive path.
CREATE POLICY challenge_comments_same_challenge_guard
  ON public.challenge_comments
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.challenge_posts AS post_row
      WHERE post_row.id = challenge_comments.post_id
        AND post_row.challenge_id = challenge_comments.challenge_id
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenge_posts'::regclass
      AND conname = 'challenge_posts_id_challenge_unique'
  ) THEN
    ALTER TABLE public.challenge_posts
      ADD CONSTRAINT challenge_posts_id_challenge_unique
      UNIQUE (id, challenge_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.challenge_comments'::regclass
      AND conname = 'challenge_comments_post_challenge_fkey'
  ) THEN
    ALTER TABLE public.challenge_comments
      ADD CONSTRAINT challenge_comments_post_challenge_fkey
      FOREIGN KEY (post_id, challenge_id)
      REFERENCES public.challenge_posts (id, challenge_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

-- Extend delegated permissions without granting lifecycle authority through
-- manage_rules. Existing permission values remain valid.
ALTER TABLE public.challenge_members
  DROP CONSTRAINT IF EXISTS challenge_members_permissions_check;

ALTER TABLE public.challenge_members
  ADD CONSTRAINT challenge_members_permissions_check
  CHECK (
    permissions <@ ARRAY[
      'manage_members',
      'manage_rules',
      'manage_join_requests',
      'moderate_posts',
      'publish_posts',
      'view_analytics',
      'complete_challenge',
      'archive_challenge'
    ]::text[]
  );

-- CH-SEC-04: ordinary members may publish normal posts. The existing member
-- insert policy remains in force; this restrictive guard protects official
-- announcements using the same publish_posts permission shown in the UI.
ALTER TABLE public.challenge_posts
  ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;

CREATE POLICY challenge_posts_announcement_permission_guard
  ON public.challenge_posts
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_announcement
    OR public.has_challenge_permission(challenge_id, 'publish_posts')
  );

-- CH-SEC-05: only the owner may change roles/delegated permissions.
CREATE OR REPLACE FUNCTION public.set_challenge_member_access(
  p_challenge_id uuid,
  p_user_id uuid,
  p_role text,
  p_permissions text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.challenges AS challenge_row
    WHERE challenge_row.id = p_challenge_id
      AND challenge_row.owner_user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'تعيين الأدوار والصلاحيات متاح لمالك التحدّي فقط';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('moderator', 'assistant', 'member') THEN
    RAISE EXCEPTION 'الدور غير صالح';
  END IF;

  IF COALESCE(p_permissions, ARRAY[]::text[]) <> ARRAY[]::text[]
     AND NOT (
       COALESCE(p_permissions, ARRAY[]::text[]) <@ ARRAY[
         'manage_members',
         'manage_rules',
         'manage_join_requests',
         'moderate_posts',
         'publish_posts',
         'view_analytics',
         'complete_challenge',
         'archive_challenge'
       ]::text[]
     ) THEN
    RAISE EXCEPTION 'تتضمن الصلاحيات قيمة غير معروفة';
  END IF;

  UPDATE public.challenge_members AS member_row
  SET role = p_role,
      permissions = COALESCE(p_permissions, ARRAY[]::text[])
  WHERE member_row.challenge_id = p_challenge_id
    AND member_row.user_id = p_user_id
    AND member_row.user_id <> (
      SELECT challenge_row.owner_user_id
      FROM public.challenges AS challenge_row
      WHERE challenge_row.id = p_challenge_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المشارك غير موجود أو لا يمكن تعديل مالك التحدّي';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_challenge_member_access(uuid, uuid, text, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_challenge_member_access(uuid, uuid, text, text[])
  TO authenticated;

-- A delegated manage_members assistant can remove ordinary members only.
-- Removing another administrator remains an owner-only operation.
CREATE OR REPLACE FUNCTION public.remove_challenge_member(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_user_id uuid;
  v_target_role text;
  v_is_owner boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  SELECT challenge_row.owner_user_id
  INTO v_owner_user_id
  FROM public.challenges AS challenge_row
  WHERE challenge_row.id = p_challenge_id
  FOR UPDATE;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'التحدّي غير موجود';
  END IF;

  v_is_owner := v_owner_user_id = (SELECT auth.uid());

  SELECT member_row.role
  INTO v_target_role
  FROM public.challenge_members AS member_row
  WHERE member_row.challenge_id = p_challenge_id
    AND member_row.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المشارك غير موجود';
  END IF;

  IF p_user_id = v_owner_user_id THEN
    RAISE EXCEPTION 'لا يمكن إزالة مالك التحدّي';
  END IF;

  IF NOT v_is_owner THEN
    IF NOT public.has_challenge_permission(p_challenge_id, 'manage_members') THEN
      RAISE EXCEPTION 'لا تملك صلاحية إدارة المشاركين';
    END IF;
    IF v_target_role <> 'member' THEN
      RAISE EXCEPTION 'يمكن للمساعد إزالة الأعضاء العاديين فقط؛ إدارة أدوار المشرفين بيد المالك';
    END IF;
  END IF;

  DELETE FROM public.challenge_members AS member_row
  WHERE member_row.challenge_id = p_challenge_id
    AND member_row.user_id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_challenge_member(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_challenge_member(uuid, uuid)
  TO authenticated;

-- New challenges begin paused while the organizer configures at least one
-- required goal. Activation is guarded below by a database trigger.
CREATE OR REPLACE FUNCTION public.create_challenge_v2(
  p_title text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_visibility text DEFAULT 'private',
  p_difficulty text DEFAULT 'medium',
  p_category text DEFAULT 'عام',
  p_join_mode text DEFAULT 'invite',
  p_max_members integer DEFAULT 50
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF p_title IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_title)) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'اسم التحدّي يجب أن يكون بين 3 و80 حرفاً';
  END IF;
  IF COALESCE(pg_catalog.char_length(p_description), 0) > 2000 THEN
    RAISE EXCEPTION 'الوصف طويل جداً';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'فترة التحدّي غير صحيحة';
  END IF;
  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'نوع الخصوصية غير صحيح';
  END IF;
  IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'مستوى الصعوبة غير صحيح';
  END IF;
  IF p_join_mode NOT IN ('open', 'approval', 'invite') THEN
    RAISE EXCEPTION 'طريقة الانضمام غير صحيحة';
  END IF;
  IF p_visibility = 'private' AND p_join_mode <> 'invite' THEN
    RAISE EXCEPTION 'التحدّي الخاص يتطلب الدعوة';
  END IF;
  IF p_max_members NOT BETWEEN 2 AND 500 THEN
    RAISE EXCEPTION 'عدد المشاركين يجب أن يكون بين 2 و500';
  END IF;

  INSERT INTO public.challenges (
    title, description, category, difficulty, visibility, status, join_mode,
    max_members, owner_user_id, start_date, end_date
  )
  VALUES (
    pg_catalog.btrim(p_title),
    COALESCE(pg_catalog.btrim(p_description), ''),
    COALESCE(NULLIF(pg_catalog.btrim(p_category), ''), 'عام'),
    p_difficulty,
    p_visibility,
    'paused',
    p_join_mode,
    p_max_members,
    (SELECT auth.uid()),
    p_start_date,
    p_end_date
  )
  RETURNING id INTO v_id;

  INSERT INTO public.challenge_members (challenge_id, user_id, role, permissions)
  VALUES (v_id, (SELECT auth.uid()), 'owner', ARRAY[]::text[]);

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_challenge_v2(text, text, date, date, text, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_challenge_v2(text, text, date, date, text, text, text, text, integer)
  TO authenticated;

-- Keep the legacy join RPC safe under a locked search_path.
CREATE OR REPLACE FUNCTION public.join_public_challenge(p_challenge_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_visibility text;
  v_join_mode text;
  v_status text;
  v_member_count integer;
  v_max_members integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'سجّل الدخول أولاً';
  END IF;

  SELECT challenge_row.visibility,
         challenge_row.join_mode,
         challenge_row.status,
         challenge_row.member_count,
         challenge_row.max_members
  INTO v_visibility, v_join_mode, v_status, v_member_count, v_max_members
  FROM public.challenges AS challenge_row
  WHERE challenge_row.id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND OR v_visibility <> 'public' THEN
    RAISE EXCEPTION 'التحدّي غير متاح';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.challenge_members AS member_row
    WHERE member_row.challenge_id = p_challenge_id
      AND member_row.user_id = (SELECT auth.uid())
  ) THEN
    RETURN p_challenge_id;
  END IF;

  IF v_join_mode <> 'open' THEN
    RAISE EXCEPTION 'هذا التحدّي لا يقبل الانضمام المفتوح';
  END IF;
  IF v_status NOT IN ('open', 'active') THEN
    RAISE EXCEPTION 'التحدّي لا يستقبل مشاركين حالياً';
  END IF;
  IF v_member_count >= v_max_members THEN
    RAISE EXCEPTION 'وصل التحدّي إلى الحد الأقصى للمشاركين';
  END IF;

  INSERT INTO public.challenge_members (challenge_id, user_id, role)
  VALUES (p_challenge_id, (SELECT auth.uid()), 'member');

  RETURN p_challenge_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_public_challenge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_challenge(uuid) TO authenticated;

-- Database invariant: an open/active challenge must have at least one active,
-- required goal overlapping its configured challenge period.
CREATE OR REPLACE FUNCTION public.enforce_active_challenge_required_goal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_challenge_id uuid;
  v_status text;
  v_start_date date;
  v_end_date date;
BEGIN
  IF TG_TABLE_NAME = 'challenges' THEN
    v_challenge_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_challenge_id := OLD.challenge_id;
  ELSE
    v_challenge_id := NEW.challenge_id;
  END IF;

  SELECT challenge_row.status, challenge_row.start_date, challenge_row.end_date
  INTO v_status, v_start_date, v_end_date
  FROM public.challenges AS challenge_row
  WHERE challenge_row.id = v_challenge_id;

  IF NOT FOUND OR v_status NOT IN ('open', 'active') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.habits AS goal_row
    WHERE goal_row.challenge_id = v_challenge_id
      AND goal_row.is_active
      AND goal_row.is_required
      AND goal_row.active_from <= v_end_date
      AND (goal_row.active_until IS NULL OR goal_row.active_until >= v_start_date)
  ) THEN
    RAISE EXCEPTION 'لا يمكن فتح أو تنشيط تحدٍّ دون هدف إلزامي نشط واحد على الأقل';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_active_challenge_required_goal()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER challenge_required_goal_after_habit_change
  AFTER INSERT OR UPDATE OR DELETE ON public.habits
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_challenge_required_goal();

CREATE TRIGGER challenge_required_goal_after_lifecycle_change
  AFTER UPDATE OF status, start_date, end_date ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_challenge_required_goal();

-- CH-SCORE-01: habits_done is a completion count, never a points total.
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(p_challenge_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  points integer,
  possible_points integer,
  adherence_pct numeric,
  full_days integer,
  habits_done integer,
  pages_read integer,
  best_streak integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_start date;
  v_end date;
  v_today date;
BEGIN
  IF NOT public.is_challenge_member(p_challenge_id) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية الوصول إلى هذا التحدّي';
  END IF;

  SELECT challenge_row.start_date, challenge_row.end_date
  INTO v_start, v_end
  FROM public.challenges AS challenge_row
  WHERE challenge_row.id = p_challenge_id;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'التحدّي غير موجود';
  END IF;

  v_today := LEAST(v_end, (pg_catalog.now() AT TIME ZONE 'Africa/Algiers')::date);
  IF v_today < v_start THEN
    v_today := v_start - 1;
  END IF;

  RETURN QUERY
  WITH calendar AS (
    SELECT series_day.day_date::date AS day_date
    FROM pg_catalog.generate_series(
      v_start::timestamp,
      v_today::timestamp,
      interval '1 day'
    ) AS series_day(day_date)
    WHERE v_today >= v_start
  ),
  member_days AS (
    SELECT
      member_row.user_id,
      calendar_row.day_date,
      COALESCE(SUM(goal_row.points) FILTER (WHERE goal_row.id IS NOT NULL), 0)::integer AS expected_points,
      COALESCE(SUM(completion_row.points_awarded) FILTER (WHERE completion_row.habit_id IS NOT NULL), 0)::integer AS day_points,
      COUNT(goal_row.id) FILTER (WHERE goal_row.is_required)::integer AS required_total,
      COUNT(completion_row.habit_id) FILTER (WHERE goal_row.is_required)::integer AS required_done,
      COUNT(completion_row.habit_id)::integer AS day_completions
    FROM public.challenge_members AS member_row
    CROSS JOIN calendar AS calendar_row
    LEFT JOIN public.habits AS goal_row
      ON goal_row.challenge_id = p_challenge_id
      AND calendar_row.day_date >= goal_row.active_from
      AND (goal_row.active_until IS NULL OR calendar_row.day_date <= goal_row.active_until)
      AND (NOT goal_row.is_fasting OR EXTRACT(ISODOW FROM calendar_row.day_date) IN (1, 4))
    LEFT JOIN public.habit_completions AS completion_row
      ON completion_row.challenge_id = p_challenge_id
      AND completion_row.user_id = member_row.user_id
      AND completion_row.habit_id = goal_row.id
      AND completion_row.log_date = calendar_row.day_date
    WHERE member_row.challenge_id = p_challenge_id
    GROUP BY member_row.user_id, calendar_row.day_date
  ),
  streak_days AS (
    SELECT
      member_day.user_id,
      member_day.day_date,
      member_day.required_total > 0
        AND member_day.required_done = member_day.required_total AS is_full,
      SUM(
        CASE
          WHEN member_day.required_total > 0
            AND member_day.required_done = member_day.required_total
          THEN 0 ELSE 1
        END
      ) OVER (
        PARTITION BY member_day.user_id
        ORDER BY member_day.day_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS streak_group
    FROM member_days AS member_day
  ),
  streaks AS (
    SELECT
      grouped.user_id,
      COALESCE(MAX(grouped.streak_length), 0)::integer AS best_streak
    FROM (
      SELECT
        streak_day.user_id,
        streak_day.streak_group,
        COUNT(*) FILTER (WHERE streak_day.is_full)::integer AS streak_length
      FROM streak_days AS streak_day
      GROUP BY streak_day.user_id, streak_day.streak_group
    ) AS grouped
    GROUP BY grouped.user_id
  ),
  totals AS (
    SELECT
      member_row.user_id,
      COALESCE(SUM(member_day.day_points), 0)::integer AS points,
      COALESCE(SUM(member_day.expected_points), 0)::integer AS possible_points,
      COALESCE(
        COUNT(*) FILTER (
          WHERE member_day.required_total > 0
            AND member_day.required_done = member_day.required_total
        ),
        0
      )::integer AS full_days,
      COALESCE(SUM(member_day.day_completions), 0)::integer AS habits_done
    FROM public.challenge_members AS member_row
    LEFT JOIN member_days AS member_day
      ON member_day.user_id = member_row.user_id
    WHERE member_row.challenge_id = p_challenge_id
    GROUP BY member_row.user_id
  ),
  reading AS (
    SELECT
      reading_row.user_id,
      SUM(reading_row.pages_read)::integer AS pages
    FROM public.reading_logs AS reading_row
    WHERE reading_row.challenge_id = p_challenge_id
      AND reading_row.log_date BETWEEN v_start AND v_today
    GROUP BY reading_row.user_id
  )
  SELECT
    totals_row.user_id,
    profile_row.display_name,
    profile_row.avatar_url,
    totals_row.points,
    totals_row.possible_points,
    CASE
      WHEN totals_row.possible_points = 0 THEN 0
      ELSE ROUND(totals_row.points::numeric / totals_row.possible_points * 100, 1)
    END,
    totals_row.full_days,
    totals_row.habits_done,
    COALESCE(reading_row.pages, 0),
    COALESCE(streak_row.best_streak, 0)
  FROM totals AS totals_row
  JOIN public.profiles AS profile_row
    ON profile_row.id = totals_row.user_id
  LEFT JOIN reading AS reading_row
    ON reading_row.user_id = totals_row.user_id
  LEFT JOIN streaks AS streak_row
    ON streak_row.user_id = totals_row.user_id
  ORDER BY totals_row.points DESC, profile_row.display_name ASC, totals_row.user_id ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_challenge_leaderboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid) TO authenticated;

-- CH-SEC-03: separate editing rules, completion and archival. Ties share
-- competition rank; the unique (challenge_id, place) constraint is removed
-- so two participants can legitimately receive the same podium place.
ALTER TABLE public.challenge_awards
  DROP CONSTRAINT IF EXISTS challenge_awards_challenge_id_place_key;

CREATE OR REPLACE FUNCTION public.set_challenge_status(
  p_challenge_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_status text;
  v_owner_user_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('open', 'active', 'paused', 'completed', 'archived') THEN
    RAISE EXCEPTION 'حالة التحدّي غير صالحة';
  END IF;

  SELECT challenge_row.status, challenge_row.owner_user_id
  INTO v_old_status, v_owner_user_id
  FROM public.challenges AS challenge_row
  WHERE challenge_row.id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'التحدّي غير موجود';
  END IF;

  IF v_old_status = 'completed' AND p_status = 'completed' THEN
    RETURN;
  END IF;
  IF v_old_status = 'archived' AND p_status = 'archived' THEN
    RETURN;
  END IF;

  IF v_old_status = 'completed' AND p_status <> 'archived' THEN
    RAISE EXCEPTION 'تم إكمال التحدّي واعتماد نتيجته؛ لا يمكن إعادة فتحه';
  END IF;
  IF v_old_status = 'archived' AND p_status <> 'archived' THEN
    RAISE EXCEPTION 'التحدّي المؤرشف لا يمكن إعادة تنشيطه';
  END IF;

  IF p_status = 'completed' THEN
    IF NOT public.has_challenge_permission(p_challenge_id, 'complete_challenge') THEN
      RAISE EXCEPTION 'إنهاء التحدّي واعتماد النتائج يحتاج صلاحية مستقلة';
    END IF;
  ELSIF p_status = 'archived' THEN
    IF NOT public.has_challenge_permission(p_challenge_id, 'archive_challenge') THEN
      RAISE EXCEPTION 'أرشفة التحدّي تحتاج صلاحية مستقلة';
    END IF;
  ELSE
    IF v_owner_user_id <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'تغيير حالة التحدّي إلى نشط أو متوقف مؤقتاً متاح للمالك فقط';
    END IF;
  END IF;

  IF p_status = 'open' AND NOT EXISTS (
    SELECT 1
    FROM public.challenges AS challenge_row
    WHERE challenge_row.id = p_challenge_id
      AND challenge_row.visibility = 'public'
  ) THEN
    RAISE EXCEPTION 'الحالة المفتوحة مخصصة للتحديات العامة';
  END IF;

  IF p_status IN ('open', 'active') AND NOT EXISTS (
    SELECT 1
    FROM public.habits AS goal_row
    JOIN public.challenges AS challenge_row
      ON challenge_row.id = goal_row.challenge_id
    WHERE goal_row.challenge_id = p_challenge_id
      AND goal_row.is_active
      AND goal_row.is_required
      AND goal_row.active_from <= challenge_row.end_date
      AND (goal_row.active_until IS NULL OR goal_row.active_until >= challenge_row.start_date)
  ) THEN
    RAISE EXCEPTION 'أضف هدفاً إلزامياً نشطاً واحداً على الأقل قبل فتح التحدّي أو تنشيطه';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.challenge_awards AS award_row
    WHERE award_row.challenge_id = p_challenge_id
  ) AND p_status IN ('open', 'active', 'paused') THEN
    RAISE EXCEPTION 'تم اعتماد جوائز التحدّي؛ لا يمكن إعادة فتحه';
  END IF;

  UPDATE public.challenges AS challenge_row
  SET status = p_status
  WHERE challenge_row.id = p_challenge_id;

  IF p_status = 'completed' THEN
    INSERT INTO public.challenge_awards (challenge_id, user_id, place, points)
    SELECT
      p_challenge_id,
      ranked.user_id,
      ranked.competition_rank::smallint,
      ranked.points
    FROM (
      SELECT
        leaderboard_row.user_id,
        leaderboard_row.points,
        RANK() OVER (ORDER BY leaderboard_row.points DESC)::integer AS competition_rank
      FROM public.get_challenge_leaderboard(p_challenge_id) AS leaderboard_row
      WHERE leaderboard_row.points > 0
    ) AS ranked
    WHERE ranked.competition_rank <= 3
    ON CONFLICT (challenge_id, user_id) DO NOTHING;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_challenge_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_challenge_status(uuid, text) TO authenticated;

COMMENT ON COLUMN public.challenge_posts.is_announcement IS
  'True for an official challenge announcement; insert requires the publish_posts delegated permission.';
