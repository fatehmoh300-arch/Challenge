-- Challenge | Supabase schema, RLS and trusted score calculations
-- Run once in Supabase SQL Editor. All challenge dates use Africa/Algiers.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'مشارك' check (char_length(display_name) between 2 and 40),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Africa/Algiers' check (timezone = 'Africa/Algiers'),
  reading_book text not null default 'كتاب التحدّي',
  weekly_reading_goal integer not null default 140 check (weekly_reading_goal between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  habit_key text not null check (habit_key in ('fajr','exercise','chess','project','reading','fasting')),
  name text not null,
  description text not null default '',
  sort_order smallint not null,
  is_fasting boolean not null default false,
  created_at timestamptz not null default now(),
  unique (challenge_id, habit_key),
  unique (id, challenge_id)
);

create table if not exists public.daily_logs (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id, log_date)
);

create table if not exists public.habit_completions (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  log_date date not null,
  quantity smallint not null default 1 check (quantity between 1 and 2),
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, habit_id, log_date),
  foreign key (habit_id, challenge_id) references public.habits(id, challenge_id) on delete cascade
);

create table if not exists public.reading_logs (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  pages_read integer not null default 0 check (pages_read between 0 and 2000),
  book_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id, log_date)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses between 0 and max_uses),
  created_at timestamptz not null default now()
);

create index if not exists idx_members_user on public.challenge_members(user_id);
create index if not exists idx_daily_logs_user_date on public.daily_logs(user_id, log_date);
create index if not exists idx_completions_user_date on public.habit_completions(user_id, log_date);
create index if not exists idx_reading_user_date on public.reading_logs(user_id, log_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists challenges_updated_at on public.challenges;
create trigger challenges_updated_at before update on public.challenges for each row execute function public.set_updated_at();
drop trigger if exists daily_logs_updated_at on public.daily_logs;
create trigger daily_logs_updated_at before update on public.daily_logs for each row execute function public.set_updated_at();
drop trigger if exists reading_logs_updated_at on public.reading_logs;
create trigger reading_logs_updated_at before update on public.reading_logs for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'مشارك'))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_challenge_member(p_challenge_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenge_members cm where cm.challenge_id = p_challenge_id and cm.user_id = auth.uid());
$$;
revoke all on function public.is_challenge_member(uuid) from public;
grant execute on function public.is_challenge_member(uuid) to authenticated;

create or replace function public.create_challenge(p_title text default 'تحدّي ديسمبر 2026', p_start_date date default date '2026-12-01', p_end_date date default date '2026-12-31')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_challenge_id uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'فترة التحدّي غير صحيحة'; end if;
  insert into public.challenges(title, owner_user_id, start_date, end_date)
  values (coalesce(nullif(trim(p_title),''),'تحدّي جديد'), auth.uid(), p_start_date, p_end_date)
  returning id into v_challenge_id;
  insert into public.challenge_members(challenge_id,user_id,role) values(v_challenge_id,auth.uid(),'owner');
  insert into public.habits(challenge_id,habit_key,name,description,sort_order,is_fasting) values
    (v_challenge_id,'fajr','صلاة الفجر','أداء صلاة الفجر في وقتها.',1,false),
    (v_challenge_id,'exercise','الرياضة','مشي لمدة 15 إلى 20 دقيقة، ولو بخطوات خفيفة.',2,false),
    (v_challenge_id,'chess','الشطرنج','لعب مباراة أو مباراتين كحد أقصى.',3,false),
    (v_challenge_id,'project','المشروع','العمل على مهمة واضحة لمدة لا تقل عن 25 دقيقة.',4,false),
    (v_challenge_id,'reading','القراءة','قراءة الحصة اليومية من الكتاب.',5,false),
    (v_challenge_id,'fasting','الصيام','صيام يوم الاثنين أو الخميس لمن يستطيع.',6,true);
  return v_challenge_id;
end; $$;
revoke all on function public.create_challenge(text,date,date) from public;
grant execute on function public.create_challenge(text,date,date) to authenticated;

create or replace function public.create_invitation(p_challenge_id uuid, p_expires_in_days integer default 7)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_owner uuid;
begin
  select owner_user_id into v_owner from public.challenges where id=p_challenge_id;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'إنشاء الدعوة متاح لمنظّم التحدّي فقط'; end if;
  if p_expires_in_days < 1 or p_expires_in_days > 30 then raise exception 'مدة الدعوة يجب أن تكون بين يوم و30 يوماً'; end if;
  v_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.invitations(challenge_id,created_by,token_hash,expires_at)
  values(p_challenge_id,auth.uid(),encode(extensions.digest(v_token,'sha256'),'hex'),now()+make_interval(days=>p_expires_in_days));
  return v_token;
end; $$;
revoke all on function public.create_invitation(uuid,integer) from public;
grant execute on function public.create_invitation(uuid,integer) to authenticated;

create or replace function public.join_challenge(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_challenge_id uuid;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولاً'; end if;
  if p_token is null or char_length(p_token) < 24 then raise exception 'رمز الدعوة غير صالح'; end if;
  update public.invitations set uses=uses+1
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now() and uses<max_uses
  returning challenge_id into v_challenge_id;
  if v_challenge_id is null then raise exception 'رابط الدعوة غير صالح أو منتهي أو استُخدم مسبقاً'; end if;
  insert into public.challenge_members(challenge_id,user_id,role) values(v_challenge_id,auth.uid(),'member')
  on conflict(challenge_id,user_id) do nothing;
  return v_challenge_id;
end; $$;
revoke all on function public.join_challenge(text) from public;
grant execute on function public.join_challenge(text) to authenticated;

create or replace function public.validate_user_day(p_challenge_id uuid,p_user_id uuid,p_log_date date)
returns void language plpgsql security definer set search_path = public as $$
declare v_start date; v_end date; v_today date;
begin
  if auth.uid() is not null and p_user_id <> auth.uid() then raise exception 'لا يمكنك تسجيل بيانات مستخدم آخر'; end if;
  select start_date,end_date into v_start,v_end from public.challenges where id=p_challenge_id;
  if v_start is null then raise exception 'التحدّي غير موجود'; end if;
  v_today := (now() at time zone 'Africa/Algiers')::date;
  if p_log_date < v_start or p_log_date > v_end then raise exception 'التاريخ خارج فترة التحدّي'; end if;
  if p_log_date > v_today then raise exception 'لا يمكن تسجيل إنجاز ليوم لم يحدث بعد'; end if;
  if not exists(select 1 from public.challenge_members where challenge_id=p_challenge_id and user_id=p_user_id) then raise exception 'المستخدم ليس عضواً في هذا التحدّي'; end if;
end; $$;

create or replace function public.validate_daily_log()
returns trigger language plpgsql set search_path = public as $$
begin perform public.validate_user_day(new.challenge_id,new.user_id,new.log_date); return new; end; $$;
drop trigger if exists daily_log_validate on public.daily_logs;
create trigger daily_log_validate before insert or update on public.daily_logs for each row execute function public.validate_daily_log();

create or replace function public.validate_completion()
returns trigger language plpgsql set search_path = public as $$
declare v_fasting boolean; v_key text;
begin
  perform public.validate_user_day(new.challenge_id,new.user_id,new.log_date);
  select is_fasting,habit_key into v_fasting,v_key from public.habits where id=new.habit_id and challenge_id=new.challenge_id;
  if v_key is null then raise exception 'العادة غير مرتبطة بهذا التحدّي'; end if;
  if v_fasting and extract(isodow from new.log_date) not in (1,4) then raise exception 'الصيام يُسجّل يوم الاثنين أو الخميس فقط'; end if;
  if v_key='chess' and new.quantity not between 1 and 2 then raise exception 'عدد مباريات الشطرنج يجب أن يكون 1 أو 2'; end if;
  if v_key<>'chess' then new.quantity:=1; end if;
  return new;
end; $$;
drop trigger if exists completion_validate on public.habit_completions;
create trigger completion_validate before insert or update on public.habit_completions for each row execute function public.validate_completion();

create or replace function public.validate_reading_log()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.validate_user_day(new.challenge_id,new.user_id,new.log_date);
  select reading_book into new.book_title from public.challenges where id=new.challenge_id;
  return new;
end; $$;
drop trigger if exists reading_log_validate on public.reading_logs;
create trigger reading_log_validate before insert or update on public.reading_logs for each row execute function public.validate_reading_log();

-- Aggregated peer leaderboard only: no habit-level or date-level peer data is returned.
create or replace function public.get_challenge_leaderboard(p_challenge_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text, points integer, possible_points integer,
  adherence_pct numeric, full_days integer, habits_done integer, pages_read integer, best_streak integer
) language plpgsql stable security definer set search_path = public as $$
declare v_start date; v_end date; v_today date;
begin
  if not public.is_challenge_member(p_challenge_id) then raise exception 'ليس لديك صلاحية الوصول إلى هذا التحدّي'; end if;
  select start_date,end_date into v_start,v_end from public.challenges where id=p_challenge_id;
  v_today := least(v_end,(now() at time zone 'Africa/Algiers')::date);
  if v_today < v_start then v_today := v_start - 1; end if;
  return query
  with member_days as (
    select cm.user_id, gs.day_date::date as day_date,
      5 + case when extract(isodow from gs.day_date)=1 or extract(isodow from gs.day_date)=4 then 1 else 0 end as day_max,
      count(hc.habit_id)::integer as day_points
    from public.challenge_members cm
    cross join lateral generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as gs(day_date)
    left join public.habit_completions hc on hc.challenge_id=p_challenge_id and hc.user_id=cm.user_id and hc.log_date=gs.day_date::date
    where cm.challenge_id=p_challenge_id and v_today>=v_start
    group by cm.user_id,gs.day_date
  ), streak_groups as (
    select user_id, day_date, day_date - (row_number() over(partition by user_id order by day_date))::integer as grp
    from member_days where day_points=day_max
  ), streaks as (
    select user_id, max(cnt)::integer as best_streak from (select user_id,grp,count(*) cnt from streak_groups group by user_id,grp) s group by user_id
  ), totals as (
    select cm.user_id,
      coalesce(sum(md.day_points),0)::integer as points,
      coalesce(sum(md.day_max),0)::integer as possible_points,
      coalesce(count(*) filter(where md.day_points=md.day_max and md.day_points>0),0)::integer as full_days,
      coalesce(sum(md.day_points),0)::integer as habits_done
    from public.challenge_members cm left join member_days md on md.user_id=cm.user_id
    where cm.challenge_id=p_challenge_id group by cm.user_id
  ), reading as (
    select user_id,sum(pages_read)::integer pages from public.reading_logs where challenge_id=p_challenge_id and log_date between v_start and v_today group by user_id
  )
  select t.user_id,p.display_name,p.avatar_url,t.points,t.possible_points,
    case when t.possible_points=0 then 0 else round(t.points::numeric/t.possible_points*100,1) end,
    t.full_days,t.habits_done,coalesce(r.pages,0),coalesce(s.best_streak,0)
  from totals t join public.profiles p on p.id=t.user_id
  left join reading r on r.user_id=t.user_id left join streaks s on s.user_id=t.user_id
  order by t.points desc,p.display_name asc;
end; $$;
revoke all on function public.get_challenge_leaderboard(uuid) from public;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;

-- Enable RLS everywhere user data is stored.
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.habits enable row level security;
alter table public.daily_logs enable row level security;
alter table public.habit_completions enable row level security;
alter table public.reading_logs enable row level security;
alter table public.invitations enable row level security;

-- profiles: only the owner can read or edit their own profile. Peer names are returned by the aggregated RPC.
drop policy if exists profile_select_self on public.profiles;
create policy profile_select_self on public.profiles for select to authenticated using (id=auth.uid());
drop policy if exists profile_update_self on public.profiles;
create policy profile_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

-- challenge and membership access is limited to members; challenge creation/joining use security-definer RPCs.
drop policy if exists challenge_select_member on public.challenges;
create policy challenge_select_member on public.challenges for select to authenticated using (public.is_challenge_member(id));
drop policy if exists challenge_update_owner on public.challenges;
create policy challenge_update_owner on public.challenges for update to authenticated using (owner_user_id=auth.uid()) with check (owner_user_id=auth.uid());
drop policy if exists members_select_member on public.challenge_members;
create policy members_select_member on public.challenge_members for select to authenticated using (public.is_challenge_member(challenge_id));

-- Habit catalogue is visible to members. No client-side direct editing of habit definitions.
drop policy if exists habits_select_member on public.habits;
create policy habits_select_member on public.habits for select to authenticated using (public.is_challenge_member(challenge_id));

-- Daily and habit detail is private to the participant who owns it.
drop policy if exists daily_select_own on public.daily_logs;
create policy daily_select_own on public.daily_logs for select to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists daily_insert_own on public.daily_logs;
create policy daily_insert_own on public.daily_logs for insert to authenticated with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists daily_update_own on public.daily_logs;
create policy daily_update_own on public.daily_logs for update to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id)) with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists daily_delete_own on public.daily_logs;
create policy daily_delete_own on public.daily_logs for delete to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id));

drop policy if exists completion_select_own on public.habit_completions;
create policy completion_select_own on public.habit_completions for select to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists completion_insert_own on public.habit_completions;
create policy completion_insert_own on public.habit_completions for insert to authenticated with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists completion_update_own on public.habit_completions;
create policy completion_update_own on public.habit_completions for update to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id)) with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists completion_delete_own on public.habit_completions;
create policy completion_delete_own on public.habit_completions for delete to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id));

drop policy if exists reading_select_own on public.reading_logs;
create policy reading_select_own on public.reading_logs for select to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists reading_insert_own on public.reading_logs;
create policy reading_insert_own on public.reading_logs for insert to authenticated with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists reading_update_own on public.reading_logs;
create policy reading_update_own on public.reading_logs for update to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id)) with check (user_id=auth.uid() and public.is_challenge_member(challenge_id));
drop policy if exists reading_delete_own on public.reading_logs;
create policy reading_delete_own on public.reading_logs for delete to authenticated using (user_id=auth.uid() and public.is_challenge_member(challenge_id));

-- Invitation tokens are never directly selectable. All issuance/redemption occurs through guarded RPCs.
-- Explicitly grant the authenticated role only the operations needed by the web client.
grant select, update on public.profiles to authenticated;
grant select, update on public.challenges to authenticated;
grant select on public.challenge_members to authenticated;
grant select on public.habits to authenticated;
grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, update, delete on public.habit_completions to authenticated;
grant select, insert, update, delete on public.reading_logs to authenticated;
revoke all on public.invitations from anon, authenticated;

-- Keep the API surface narrow.
revoke all on function public.validate_user_day(uuid,uuid,date) from public;
grant execute on function public.validate_user_day(uuid,uuid,date) to authenticated;
