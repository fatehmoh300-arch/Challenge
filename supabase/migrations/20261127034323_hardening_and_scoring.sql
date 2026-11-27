-- Challenge | hardening and scoring corrections
-- Apply after 202611270001_challenge_schema.sql.
-- Safe to run once on a database where migration 001 is already installed.

-- Security-definer functions must not resolve caller-controlled objects through
-- the public schema. All application relations and auth helpers in these
-- functions are already schema-qualified.
alter function public.handle_new_user() set search_path = '';
alter function public.is_challenge_member(uuid) set search_path = '';
alter function public.create_challenge(text, date, date) set search_path = '';
alter function public.create_invitation(uuid, integer) set search_path = '';
alter function public.join_challenge(text) set search_path = '';
alter function public.validate_user_day(uuid, uuid, date) set search_path = '';
alter function public.get_challenge_leaderboard(uuid) set search_path = '';

-- The auth.users trigger is the only intended caller of this function.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Members need to read only their own membership row. Peer names and scores
-- are delivered by the aggregate leaderboard RPC, not by exposing member IDs.
drop policy if exists members_select_member on public.challenge_members;
drop policy if exists members_select_self on public.challenge_members;
create policy members_select_self
  on public.challenge_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- RLS remains the row-level boundary; remove unnecessary table grants for
-- unauthenticated clients as an additional least-privilege layer.
revoke all on table
  public.profiles,
  public.challenges,
  public.challenge_members,
  public.habits,
  public.daily_logs,
  public.habit_completions,
  public.reading_logs,
  public.invitations
from anon;

-- Preserve the book title recorded for a reading entry. If a client omits it,
-- use the challenge's current book title as a fallback.
create or replace function public.validate_reading_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.validate_user_day(new.challenge_id, new.user_id, new.log_date);

  if new.book_title is null or pg_catalog.btrim(new.book_title) = '' then
    select c.reading_book
      into new.book_title
      from public.challenges as c
     where c.id = new.challenge_id;
  end if;

  return new;
end;
$$;

-- Fasting is an optional bonus point. A "full day" and a streak therefore
-- require the five core habits, not the optional fasting entry.
create or replace function public.get_challenge_leaderboard(p_challenge_id uuid)
returns table (
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_today date;
begin
  if not public.is_challenge_member(p_challenge_id) then
    raise exception 'ليس لديك صلاحية الوصول إلى هذا التحدّي';
  end if;

  select c.start_date, c.end_date
    into v_start, v_end
    from public.challenges as c
   where c.id = p_challenge_id;

  v_today := least(v_end, (now() at time zone 'Africa/Algiers')::date);
  if v_today < v_start then
    v_today := v_start - 1;
  end if;

  return query
  with member_days as (
    select
      cm.user_id,
      gs.day_date::date as day_date,
      5 + case
        when extract(isodow from gs.day_date) in (1, 4) then 1
        else 0
      end as day_max,
      count(hc.habit_id)::integer as day_points,
      count(hc.habit_id) filter (
        where coalesce(h.is_fasting, false) = false
      )::integer as core_points
    from public.challenge_members as cm
    cross join lateral pg_catalog.generate_series(
      v_start::timestamp,
      v_today::timestamp,
      interval '1 day'
    ) as gs(day_date)
    left join public.habit_completions as hc
      on hc.challenge_id = p_challenge_id
     and hc.user_id = cm.user_id
     and hc.log_date = gs.day_date::date
    left join public.habits as h
      on h.id = hc.habit_id
     and h.challenge_id = hc.challenge_id
    where cm.challenge_id = p_challenge_id
      and v_today >= v_start
    group by cm.user_id, gs.day_date
  ),
  streak_groups as (
    select
      user_id,
      day_date,
      day_date - (row_number() over (
        partition by user_id order by day_date
      ))::integer as grp
    from member_days
    where core_points = 5
  ),
  streaks as (
    select user_id, max(cnt)::integer as best_streak
    from (
      select user_id, grp, count(*) as cnt
      from streak_groups
      group by user_id, grp
    ) as grouped_streaks
    group by user_id
  ),
  totals as (
    select
      cm.user_id,
      coalesce(sum(md.day_points), 0)::integer as points,
      coalesce(sum(md.day_max), 0)::integer as possible_points,
      coalesce(count(*) filter (
        where md.core_points = 5
      ), 0)::integer as full_days,
      coalesce(sum(md.day_points), 0)::integer as habits_done
    from public.challenge_members as cm
    left join member_days as md on md.user_id = cm.user_id
    where cm.challenge_id = p_challenge_id
    group by cm.user_id
  ),
  reading as (
    select
      rl.user_id,
      sum(rl.pages_read)::integer as pages
    from public.reading_logs as rl
    where rl.challenge_id = p_challenge_id
      and rl.log_date between v_start and v_today
    group by rl.user_id
  )
  select
    t.user_id,
    p.display_name,
    p.avatar_url,
    t.points,
    t.possible_points,
    case
      when t.possible_points = 0 then 0
      else round(t.points::numeric / t.possible_points * 100, 1)
    end,
    t.full_days,
    t.habits_done,
    coalesce(r.pages, 0),
    coalesce(s.best_streak, 0)
  from totals as t
  join public.profiles as p on p.id = t.user_id
  left join reading as r on r.user_id = t.user_id
  left join streaks as s on s.user_id = t.user_id
  order by t.points desc, p.display_name asc;
end;
$$;

revoke all on function public.get_challenge_leaderboard(uuid) from public;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
