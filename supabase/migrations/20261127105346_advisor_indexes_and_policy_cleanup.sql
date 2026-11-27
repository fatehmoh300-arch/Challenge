-- Follow-up hardening: cover foreign keys and consolidate profile read policy.
-- This migration is additive and safe after flexible_challenges_progression.

create index if not exists idx_challenge_comments_author
  on public.challenge_comments(author_id);
create index if not exists idx_challenge_comments_challenge
  on public.challenge_comments(challenge_id);

create index if not exists idx_challenge_join_requests_user
  on public.challenge_join_requests(user_id);
create index if not exists idx_challenge_join_requests_reviewed_by
  on public.challenge_join_requests(reviewed_by)
  where reviewed_by is not null;

create index if not exists idx_challenge_posts_author
  on public.challenge_posts(author_id);

-- Use a single SELECT policy so PostgreSQL evaluates one policy expression.
drop policy if exists profile_select_self on public.profiles;
drop policy if exists profiles_select_challenge_peers on public.profiles;
create policy profiles_select_self_or_challenge_peers
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.shares_challenge_with(id)
);

