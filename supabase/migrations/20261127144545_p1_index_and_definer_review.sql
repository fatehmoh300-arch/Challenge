-- P1 follow-up from Supabase Database Advisor and SECURITY DEFINER review.
-- Additive and data-preserving. No production records are modified or deleted.

-- Cover the referencing columns of the composite comment -> post foreign key.
CREATE INDEX IF NOT EXISTS idx_challenge_comments_post_challenge
  ON public.challenge_comments (post_id, challenge_id);

-- This function is trigger-only and schema-qualifies its table references.
-- Remove public from the search path; pg_catalog is sufficient.
ALTER FUNCTION public.sync_challenge_member_count()
  SET search_path = pg_catalog;

-- Authenticated callers must always have a subject. Do not permit an
-- identity-less invocation even if a JWT only carries a role claim.
CREATE OR REPLACE FUNCTION public.validate_user_day(
  p_challenge_id uuid,
  p_user_id uuid,
  p_log_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_start date;
  v_end date;
  v_status text;
  v_today date;
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'لا يمكنك تسجيل بيانات مستخدم آخر';
  END IF;

  SELECT challenge_row.start_date,
         challenge_row.end_date,
         challenge_row.status
  INTO v_start, v_end, v_status
  FROM public.challenges AS challenge_row
  WHERE challenge_row.id = p_challenge_id;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'التحدّي غير موجود';
  END IF;

  IF v_status NOT IN ('open', 'active') THEN
    RAISE EXCEPTION 'التحدّي متوقف عن استقبال تسجيلات جديدة';
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Africa/Algiers')::date;

  IF p_log_date < v_start OR p_log_date > v_end THEN
    RAISE EXCEPTION 'التاريخ خارج فترة التحدّي';
  END IF;

  IF p_log_date > v_today THEN
    RAISE EXCEPTION 'لا يمكن تسجيل إنجاز ليوم لم يحدث بعد';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.challenge_members AS member_row
    WHERE member_row.challenge_id = p_challenge_id
      AND member_row.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'المستخدم ليس عضواً في هذا التحدّي';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_user_day(uuid, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_user_day(uuid, uuid, date)
  TO authenticated;
