-- Fix PL/pgSQL output-column ambiguity in personal progress and leaderboard RPCs.
-- All source columns matching RETURNS TABLE output names are table-qualified.

create or replace function public.get_my_progress()
returns table(
  xp integer,
  completed_tasks integer,
  active_days integer,
  pages_read integer,
  best_streak integer,
  achievements jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $progress$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  return query
  with task_totals as (
    select
      count(*)::integer as tasks,
      coalesce(sum(hc.points_awarded),0)::integer as xp
    from public.habit_completions hc
    where hc.user_id=v_uid
  ),
  reading_totals as (
    select coalesce(sum(rl.pages_read),0)::integer as pages
    from public.reading_logs rl
    where rl.user_id=v_uid
  ),
  days as (
    select distinct hc.log_date
    from public.habit_completions hc
    where hc.user_id=v_uid
  ),
  groups as (
    select d.log_date,
      d.log_date-(row_number() over(order by d.log_date))::integer as grp
    from days d
  ),
  streaks as (
    select count(*)::integer as n
    from groups g
    group by g.grp
  ),
  active as (
    select count(*)::integer as n from days
  )
  select
    t.xp,
    t.tasks,
    a.n,
    r.pages,
    coalesce((select max(s.n) from streaks s),0),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('key',ua.achievement_key,'earned_at',ua.earned_at)
        order by ua.earned_at
      )
      from public.user_achievements ua
      where ua.user_id=v_uid
    ),'[]'::jsonb)
  from task_totals t
  cross join reading_totals r
  cross join active a;
end;
$progress$;

revoke all on function public.get_my_progress() from public,anon;
grant execute on function public.get_my_progress() to authenticated;

create or replace function public.get_challenge_leaderboard(p_challenge_id uuid)
returns table(
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
as $leaderboard$
declare
  v_start date;
  v_end date;
  v_today date;
begin
  if not public.is_challenge_member(p_challenge_id) then
    raise exception 'ليس لديك صلاحية الوصول إلى هذا التحدّي';
  end if;

  select c.start_date,c.end_date
    into v_start,v_end
  from public.challenges c
  where c.id=p_challenge_id;

  if v_start is null then raise exception 'التحدّي غير موجود'; end if;

  v_today:=least(v_end,(now() at time zone 'Africa/Algiers')::date);
  if v_today<v_start then v_today:=v_start-1; end if;

  return query
  with calendar as (
    select gs.day_date::date as day_date
    from generate_series(v_start::timestamp,v_today::timestamp,interval '1 day') gs(day_date)
    where v_today>=v_start
  ),
  member_days as (
    select
      cm.user_id,
      cal.day_date,
      coalesce(sum(h.points) filter(where h.id is not null),0)::integer as expected_points,
      coalesce(sum(hc.points_awarded) filter(where hc.habit_id is not null),0)::integer as day_points,
      count(h.id) filter(where h.is_required)::integer as required_total,
      count(hc.habit_id) filter(where h.is_required)::integer as required_done
    from public.challenge_members cm
    cross join calendar cal
    left join public.habits h
      on h.challenge_id=p_challenge_id
      and cal.day_date>=h.active_from
      and (h.active_until is null or cal.day_date<=h.active_until)
      and (not h.is_fasting or extract(isodow from cal.day_date) in (1,4))
    left join public.habit_completions hc
      on hc.challenge_id=p_challenge_id
      and hc.user_id=cm.user_id
      and hc.habit_id=h.id
      and hc.log_date=cal.day_date
    where cm.challenge_id=p_challenge_id
    group by cm.user_id,cal.day_date
  ),
  streak_days as (
    select
      md.user_id,
      md.day_date,
      md.day_date-(row_number() over(partition by md.user_id order by md.day_date))::integer as grp
    from member_days md
    where md.required_total>0 and md.required_done=md.required_total
  ),
  streaks as (
    select sd.user_id,max(sd.streak_count)::integer as best_streak
    from (
      select s.user_id,s.grp,count(*) as streak_count
      from streak_days s
      group by s.user_id,s.grp
    ) sd
    group by sd.user_id
  ),
  totals as (
    select
      cm.user_id,
      coalesce(sum(md.day_points),0)::integer as points,
      coalesce(sum(md.expected_points),0)::integer as possible_points,
      coalesce(count(*) filter(where md.required_total>0 and md.required_done=md.required_total),0)::integer as full_days,
      coalesce(sum(md.day_points),0)::integer as habits_done
    from public.challenge_members cm
    left join member_days md on md.user_id=cm.user_id
    where cm.challenge_id=p_challenge_id
    group by cm.user_id
  ),
  reading as (
    select
      rl.user_id,
      sum(rl.pages_read)::integer as pages
    from public.reading_logs rl
    where rl.challenge_id=p_challenge_id
      and rl.log_date between v_start and v_today
    group by rl.user_id
  )
  select
    t.user_id,
    p.display_name,
    p.avatar_url,
    t.points,
    t.possible_points,
    case when t.possible_points=0 then 0
      else round(t.points::numeric/t.possible_points*100,1)
    end,
    t.full_days,
    t.habits_done,
    coalesce(r.pages,0),
    coalesce(s.best_streak,0)
  from totals t
  join public.profiles p on p.id=t.user_id
  left join reading r on r.user_id=t.user_id
  left join streaks s on s.user_id=t.user_id
  order by t.points desc,p.display_name;
end;
$leaderboard$;

revoke all on function public.get_challenge_leaderboard(uuid) from public;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
