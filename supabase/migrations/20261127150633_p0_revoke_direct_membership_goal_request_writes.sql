-- P0: membership, goals and join requests are mutation-RPC-only resources.
-- Reduce API grants to the minimum so direct REST writes cannot bypass the
-- validated SECURITY DEFINER workflows.
-- No rows are deleted or updated by this migration.

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.challenge_members
  FROM authenticated;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.habits
  FROM authenticated;

-- Requests are created exclusively by request_join_challenge(), which fixes
-- status/reviewer fields and locks the challenge row for capacity checks.
REVOKE INSERT
  ON TABLE public.challenge_join_requests
  FROM authenticated;

-- Defense in depth for any future explicit INSERT grant: a request submitted
-- directly through PostgREST can never arrive pre-approved or self-reviewed.
DROP POLICY IF EXISTS join_requests_insert_own
  ON public.challenge_join_requests;

CREATE POLICY join_requests_insert_own
  ON public.challenge_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.challenges AS challenge_row
      WHERE challenge_row.id = challenge_join_requests.challenge_id
        AND challenge_row.visibility = 'public'
        AND challenge_row.join_mode = 'approval'
        AND challenge_row.status IN ('open', 'active')
    )
  );
