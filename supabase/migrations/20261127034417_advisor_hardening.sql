-- Challenge | advisor-driven privilege and query-plan hardening
-- Apply after 202611270002_hardening_and_scoring.sql.

-- SECURITY DEFINER RPCs are intentionally available to authenticated users,
-- but must never be callable by the anonymous API role.
revoke execute on function public.is_challenge_member(uuid) from anon;
revoke execute on function public.create_challenge(text, date, date) from anon;
revoke execute on function public.create_invitation(uuid, integer) from anon;
revoke execute on function public.join_challenge(text) from anon;
revoke execute on function public.validate_user_day(uuid, uuid, date) from anon;
revoke execute on function public.get_challenge_leaderboard(uuid) from anon;

-- Add indexes for foreign keys that do not already have a covering index.
create index if not exists idx_challenges_owner_user_id
  on public.challenges(owner_user_id);
create index if not exists idx_habit_completions_habit_challenge
  on public.habit_completions(habit_id, challenge_id);
create index if not exists idx_invitations_challenge_id
  on public.invitations(challenge_id);
create index if not exists idx_invitations_created_by
  on public.invitations(created_by);

-- Evaluate auth.uid() once per statement rather than once per candidate row.
drop policy if exists profile_select_self on public.profiles;
create policy profile_select_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profile_update_self on public.profiles;
create policy profile_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists challenge_update_owner on public.challenges;
create policy challenge_update_owner
  on public.challenges for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists daily_select_own on public.daily_logs;
create policy daily_select_own on public.daily_logs for select to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists daily_insert_own on public.daily_logs;
create policy daily_insert_own on public.daily_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists daily_update_own on public.daily_logs;
create policy daily_update_own on public.daily_logs for update to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id))
  with check (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists daily_delete_own on public.daily_logs;
create policy daily_delete_own on public.daily_logs for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));

drop policy if exists completion_select_own on public.habit_completions;
create policy completion_select_own on public.habit_completions for select to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists completion_insert_own on public.habit_completions;
create policy completion_insert_own on public.habit_completions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists completion_update_own on public.habit_completions;
create policy completion_update_own on public.habit_completions for update to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id))
  with check (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists completion_delete_own on public.habit_completions;
create policy completion_delete_own on public.habit_completions for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));

drop policy if exists reading_select_own on public.reading_logs;
create policy reading_select_own on public.reading_logs for select to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists reading_insert_own on public.reading_logs;
create policy reading_insert_own on public.reading_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists reading_update_own on public.reading_logs;
create policy reading_update_own on public.reading_logs for update to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id))
  with check (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
drop policy if exists reading_delete_own on public.reading_logs;
create policy reading_delete_own on public.reading_logs for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_challenge_member(challenge_id));
