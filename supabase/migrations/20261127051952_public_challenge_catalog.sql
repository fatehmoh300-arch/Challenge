-- Public challenge discovery foundation. Existing challenges remain private by default.
alter table public.challenges
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'عام',
  add column if not exists difficulty text not null default 'medium',
  add column if not exists visibility text not null default 'private',
  add column if not exists status text not null default 'active',
  add column if not exists join_mode text not null default 'invite',
  add column if not exists max_members integer not null default 50,
  add column if not exists member_count integer not null default 0;

alter table public.challenges
  add constraint challenges_description_length
    check (char_length(description) <= 2000),
  add constraint challenges_difficulty_check
    check (difficulty in ('easy', 'medium', 'hard')),
  add constraint challenges_visibility_check
    check (visibility in ('public', 'private')),
  add constraint challenges_status_check
    check (status in ('draft', 'open', 'active', 'paused', 'completed', 'archived')),
  add constraint challenges_join_mode_check
    check (join_mode in ('open', 'approval', 'invite')),
  add constraint challenges_max_members_check
    check (max_members between 2 and 500),
  add constraint challenges_member_count_check
    check (member_count >= 0 and member_count <= max_members);

alter table public.challenge_members
  drop constraint if exists challenge_members_role_check;
alter table public.challenge_members
  add constraint challenge_members_role_check
    check (role in ('owner', 'moderator', 'assistant', 'member'));

update public.challenges c
set member_count = (
  select count(*)::integer
  from public.challenge_members cm
  where cm.challenge_id = c.id
);

create index if not exists idx_challenges_public_catalog
  on public.challenges (created_at desc)
  where visibility = 'public' and status in ('open', 'active', 'paused', 'completed');

create or replace function public.sync_challenge_member_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    update public.challenges
    set member_count = member_count + 1
    where id = new.challenge_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.challenges
    set member_count = greatest(member_count - 1, 0)
    where id = old.challenge_id;
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_challenge_member_count() from public, anon, authenticated;

drop trigger if exists challenge_member_count_insert on public.challenge_members;
create trigger challenge_member_count_insert
after insert on public.challenge_members
for each row execute function public.sync_challenge_member_count();

drop trigger if exists challenge_member_count_delete on public.challenge_members;
create trigger challenge_member_count_delete
after delete on public.challenge_members
for each row execute function public.sync_challenge_member_count();

drop policy if exists challenge_select_public on public.challenges;
create policy challenge_select_public
on public.challenges
for select
to anon, authenticated
using (
  visibility = 'public'
  and status in ('open', 'active', 'paused', 'completed')
);

-- Guests can read only the fields required for public discovery.
grant select (
  id, title, description, category, difficulty, start_date, end_date,
  status, visibility, join_mode, max_members, member_count, created_at
) on public.challenges to anon;

comment on column public.challenges.visibility is
  'public challenges are discoverable; private challenges are visible only to authorized members.';
comment on column public.challenges.join_mode is
  'open: immediate join; approval: request required; invite: invitation token required.';
comment on column public.challenges.member_count is
  'Maintained by database triggers; does not expose member identities.';
