-- CH-SEC-02 follow-up: repair the original permissive comment policy as well.
-- The restrictive guard and composite FK remain as independent integrity layers.
-- This migration changes policy logic only and preserves all existing comments.

DROP POLICY IF EXISTS challenge_comments_member_insert
  ON public.challenge_comments;

CREATE POLICY challenge_comments_member_insert
  ON public.challenge_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.is_challenge_member(challenge_id)
    AND EXISTS (
      SELECT 1
      FROM public.challenge_posts AS post_row
      WHERE post_row.id = challenge_comments.post_id
        AND post_row.challenge_id = challenge_comments.challenge_id
    )
  );
