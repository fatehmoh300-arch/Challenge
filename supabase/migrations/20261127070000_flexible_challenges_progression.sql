-- Flexible challenges, multi-challenge membership, custom goals, progression and community.
-- Apply after the public challenge foundation migrations (004-006).

-- Keep the legacy RPC compatible with the already deployed frontend, but remove
-- its fixed December dates and pre-seeded habits. New clients use create_challenge_v2.
create or replace function public.create_challenge(
  p_title text default 'تحدٍّ جديد',
  p_start_date date default ((now() at time zone 'Africa/Algiers')::date),
  p_end_date date default (((now() at time zone 'Africa/Algiers')::date) + 29)
)
returns uuid
language sql
security definer
set search_path = ''
as $legacy$
  select public.create_challenge_v2(
    p_title, '', p_start_date, p_end_date, 'private', 'medium', 'عام', 'invite', 50
  );
$legacy$;
revoke all on function public.create_challenge(text,date,date) from public,anon;
grant execute on function public.create_challenge(text,date,date) to authenticated;

alter table public.challenge_members
  add column if not exists permissions text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.challenge_members'::regclass
      and conname = 'challenge_members_permissions_check'
  ) then
    alter table public.challenge_members
      add constraint challenge_members_permissions_check
      check (permissions <@ array[
        'manage_members','manage_rules','manage_join_requests',
        'moderate_posts','publish_posts','view_analytics'
      ]::text[]);
  end if;
end $$;

-- Goals are now configured per challenge instead of using a fixed six-habit preset.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.habits'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%habit_key%'
  loop
    execute format('alter table public.habits drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.habit_completions
  add column if not exists points_awarded smallint not null default 1;

alter table public.habits
  add column if not exists points smallint not null default 1,
  add column if not exists is_required boolean not null default true,
  add column if not exists is_active boolean not null default true,
  add column if not exists active_from date,
  add column if not exists active_until date;

update public.habit_completions hc
set points_awarded = h.points
from public.habits h
where h.id = hc.habit_id and h.challenge_id = hc.challenge_id;

update public.habits h
set active_from = c.start_date,
    is_required = case when h.is_fasting then false else h.is_required end
from public.challenges c
where h.challenge_id = c.id and h.active_from is null;

alter table public.habits
  alter column active_from set not null,
  alter column active_from set default current_date;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.habits'::regclass and conname='habits_points_range_check') then
    alter table public.habits add constraint habits_points_range_check check (points between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.habits'::regclass and conname='habits_active_dates_check') then
    alter table public.habits add constraint habits_active_dates_check check (active_until is null or active_until >= active_from or not is_active);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.habits'::regclass and conname='habits_habit_key_format_check') then
    alter table public.habits add constraint habits_habit_key_format_check check (habit_key ~ '^[a-z][a-z0-9_]{1,63}$');
  end if;
end $$;

create index if not exists idx_habits_challenge_active
  on public.habits(challenge_id, is_active, active_from, active_until);

-- A user may have several independent challenge memberships.
-- Join requests are used only for public challenges that require approval.
create table if not exists public.challenge_join_requests (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  message text not null default '' check (char_length(message) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(challenge_id,user_id)
);
create index if not exists idx_join_requests_challenge_status
  on public.challenge_join_requests(challenge_id,status,created_at desc);

-- Lightweight challenge feed.
create table if not exists public.challenge_posts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_challenge_posts_feed
  on public.challenge_posts(challenge_id,created_at desc);

create table if not exists public.challenge_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.challenge_posts(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_challenge_comments_post
  on public.challenge_comments(post_id,created_at asc);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  earned_at timestamptz not null default now(),
  primary key(user_id,achievement_key)
);
create index if not exists idx_user_achievements_user
  on public.user_achievements(user_id,earned_at desc);

-- Digital podium awards are granted automatically when a challenge is completed.
create table if not exists public.challenge_awards (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  place smallint not null check (place between 1 and 3),
  points integer not null check (points > 0),
  awarded_at timestamptz not null default now(),
  primary key(challenge_id,user_id),
  unique(challenge_id,place)
);
create index if not exists idx_challenge_awards_user
  on public.challenge_awards(user_id,awarded_at desc);

-- The owner always has full authority; delegated permissions are challenge-scoped.
create or replace function public.has_challenge_permission(p_challenge_id uuid,p_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.challenges c
    join public.challenge_members cm on cm.challenge_id=c.id
    where c.id=p_challenge_id
      and cm.user_id=(select auth.uid())
      and (
        c.owner_user_id=(select auth.uid())
        or p_permission=any(cm.permissions)
      )
  );
$$;
revoke all on function public.has_challenge_permission(uuid,text) from public,anon;
grant execute on function public.has_challenge_permission(uuid,text) to authenticated;

create or replace function public.shares_challenge_with(p_other_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.challenge_members mine
    join public.challenge_members peer on peer.challenge_id=mine.challenge_id
    where mine.user_id=(select auth.uid())
      and peer.user_id=p_other_user_id
  );
$$;
revoke all on function public.shares_challenge_with(uuid) from public,anon;
grant execute on function public.shares_challenge_with(uuid) to authenticated;

-- New challenge creation takes dates from the user and creates no preselected tasks.
create or replace function public.create_challenge_v2(
  p_title text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_visibility text default 'private',
  p_difficulty text default 'medium',
  p_category text default 'عام',
  p_join_mode text default 'invite',
  p_max_members integer default 50
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if (select auth.uid()) is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_title is null or char_length(pg_catalog.btrim(p_title)) not between 3 and 80 then
    raise exception 'اسم التحدّي يجب أن يكون بين 3 و80 حرفاً';
  end if;
  if coalesce(char_length(p_description),0)>2000 then raise exception 'الوصف طويل جداً'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'فترة التحدّي غير صحيحة';
  end if;
  if p_visibility not in ('public','private') then raise exception 'نوع الخصوصية غير صحيح'; end if;
  if p_difficulty not in ('easy','medium','hard') then raise exception 'مستوى الصعوبة غير صحيح'; end if;
  if p_join_mode not in ('open','approval','invite') then raise exception 'طريقة الانضمام غير صحيحة'; end if;
  if p_visibility='private' and p_join_mode<>'invite' then
    raise exception 'التحدّي الخاص يتطلب الدعوة';
  end if;
  if p_max_members not between 2 and 500 then raise exception 'عدد المشاركين يجب أن يكون بين 2 و500'; end if;

  insert into public.challenges(
    title,description,category,difficulty,visibility,status,join_mode,
    max_members,owner_user_id,start_date,end_date
  ) values (
    pg_catalog.btrim(p_title),coalesce(pg_catalog.btrim(p_description), ''),
    coalesce(nullif(pg_catalog.btrim(p_category),''),'عام'),p_difficulty,
    p_visibility,
    case when p_end_date<v_today then 'completed' when p_start_date>v_today then 'open' else 'active' end,
    p_join_mode,p_max_members,(select auth.uid()),p_start_date,p_end_date
  ) returning id into v_id;

  insert into public.challenge_members(challenge_id,user_id,role,permissions)
  values(v_id,(select auth.uid()),'owner',array[]::text[]);
  return v_id;
end;
$$;
revoke all on function public.create_challenge_v2(text,text,date,date,text,text,text,text,integer) from public,anon;
grant execute on function public.create_challenge_v2(text,text,date,date,text,text,text,text,integer) to authenticated;

create or replace function public.update_challenge_details(
  p_challenge_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_start_date date,
  p_end_date date,
  p_visibility text,
  p_difficulty text,
  p_join_mode text,
  p_max_members integer
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_members integer;
begin
  if not public.has_challenge_permission(p_challenge_id,'manage_rules') then
    raise exception 'لا تملك صلاحية تعديل إعدادات التحدّي';
  end if;
  if p_title is null or char_length(pg_catalog.btrim(p_title)) not between 3 and 80 then
    raise exception 'اسم التحدّي يجب أن يكون بين 3 و80 حرفاً';
  end if;
  if coalesce(char_length(p_description),0)>2000 then raise exception 'الوصف طويل جداً'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'الفترة غير صحيحة'; end if;
  if p_visibility not in ('public','private') or p_difficulty not in ('easy','medium','hard') then raise exception 'إعداد غير صحيح'; end if;
  if p_join_mode not in ('open','approval','invite') then raise exception 'طريقة الانضمام غير صحيحة'; end if;
  if p_visibility='private' and p_join_mode<>'invite' then raise exception 'التحدّي الخاص يقبل الدعوات فقط'; end if;
  if p_max_members not between 2 and 500 then raise exception 'الحد الأقصى يجب أن يكون بين 2 و500'; end if;
  select count(*) into v_members from public.challenge_members where challenge_id=p_challenge_id;
  if p_max_members<v_members then raise exception 'الحد الأقصى أقل من عدد الأعضاء الحالي'; end if;
  if exists (
    select 1 from public.daily_logs d where d.challenge_id=p_challenge_id
      and d.log_date not between p_start_date and p_end_date
  ) or exists (
    select 1 from public.habit_completions hc where hc.challenge_id=p_challenge_id
      and hc.log_date not between p_start_date and p_end_date
  ) or exists (
    select 1 from public.reading_logs r where r.challenge_id=p_challenge_id
      and r.log_date not between p_start_date and p_end_date
  ) then
    raise exception 'لا يمكن تغيير المدة لتستبعد سجلات إنجاز موجودة بالفعل';
  end if;

  update public.challenges set
    title=pg_catalog.btrim(p_title),
    description=coalesce(pg_catalog.btrim(p_description),''),
    category=coalesce(nullif(pg_catalog.btrim(p_category),''),'عام'),
    start_date=p_start_date,end_date=p_end_date,
    visibility=p_visibility,difficulty=p_difficulty,join_mode=p_join_mode,
    max_members=p_max_members
  where id=p_challenge_id;
end;
$$;
revoke all on function public.update_challenge_details(uuid,text,text,text,date,date,text,text,text,integer) from public,anon;
grant execute on function public.update_challenge_details(uuid,text,text,text,date,date,text,text,text,integer) to authenticated;


create or replace function public.set_challenge_status(p_challenge_id uuid,p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $status$
declare v_old_status text;
begin
  if not public.has_challenge_permission(p_challenge_id,'manage_rules') then
    raise exception 'لا تملك صلاحية تغيير حالة التحدّي';
  end if;
  if p_status not in ('open','active','paused','completed','archived') then
    raise exception 'حالة التحدّي غير صالحة';
  end if;
  select status into v_old_status from public.challenges where id=p_challenge_id for update;
  if not found then raise exception 'التحدّي غير موجود'; end if;
  if p_status='open' and not exists (
    select 1 from public.challenges c where c.id=p_challenge_id and c.visibility='public'
  ) then
    raise exception 'الحالة المفتوحة مخصصة للتحديات العامة';
  end if;
  if v_old_status='completed' and p_status not in ('completed','archived') then
    raise exception 'تم إكمال التحدّي واعتماد نتيجته؛ لا يمكن إعادة فتحه';
  end if;
  if v_old_status='archived' and p_status<>'archived' then
    raise exception 'التحدّي المؤرشف لا يمكن إعادة تنشيطه';
  end if;
  if exists(select 1 from public.challenge_awards a where a.challenge_id=p_challenge_id)
    and p_status in ('open','active','paused') then
    raise exception 'تم اعتماد جوائز التحدّي؛ لا يمكن إعادة فتحه';
  end if;
  update public.challenges set status=p_status where id=p_challenge_id;
  if p_status='completed' and v_old_status<>'completed' then
    insert into public.challenge_awards(challenge_id,user_id,place,points)
    select p_challenge_id,ranked.user_id,ranked.place,ranked.points
    from (
      select lb.user_id,lb.points,
        row_number() over(order by lb.points desc,lb.display_name asc)::smallint as place
      from public.get_challenge_leaderboard(p_challenge_id) lb
      where lb.points>0
    ) ranked
    where ranked.place<=3
    on conflict do nothing;
  end if;
end;
$status$;
revoke all on function public.set_challenge_status(uuid,text) from public,anon;
grant execute on function public.set_challenge_status(uuid,text) to authenticated;

create or replace function public.create_challenge_goal(
  p_challenge_id uuid,p_name text,p_description text,p_points integer,p_is_required boolean
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_start date;
  v_end date;
  v_active_from date;
begin
  if not public.has_challenge_permission(p_challenge_id,'manage_rules') then raise exception 'لا تملك صلاحية إضافة أهداف'; end if;
  if p_name is null or char_length(pg_catalog.btrim(p_name)) not between 2 and 80 then raise exception 'اسم الهدف يجب أن يكون بين حرفين و80 حرفاً'; end if;
  if coalesce(char_length(p_description),0)>500 then raise exception 'الوصف طويل جداً'; end if;
  if p_points not between 1 and 100 then raise exception 'النقاط يجب أن تكون بين 1 و100'; end if;
  select start_date,end_date into v_start,v_end from public.challenges where id=p_challenge_id;
  if v_start is null then raise exception 'التحدّي غير موجود'; end if;
  v_active_from:=greatest(v_start,(now() at time zone 'Africa/Algiers')::date);
  if v_active_from>v_end then raise exception 'انتهت فترة التحدّي ولا يمكن إضافة أهداف جديدة'; end if;
  insert into public.habits(challenge_id,habit_key,name,description,sort_order,is_fasting,points,is_required,is_active,active_from,active_until)
  values (
    p_challenge_id,'goal_'||replace(gen_random_uuid()::text,'-',''),pg_catalog.btrim(p_name),
    coalesce(pg_catalog.btrim(p_description),''),(select coalesce(max(sort_order),0)+1 from public.habits where challenge_id=p_challenge_id),
    false,p_points,p_is_required,true,v_active_from,null
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_challenge_goal(uuid,text,text,integer,boolean) from public,anon;
grant execute on function public.create_challenge_goal(uuid,text,text,integer,boolean) to authenticated;

create or replace function public.update_challenge_goal(
  p_challenge_id uuid,p_goal_id uuid,p_name text,p_description text,p_points integer,
  p_is_required boolean,p_is_active boolean
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_old_points smallint;
  v_old_required boolean;
  v_old_active boolean;
  v_has_activity boolean;
begin
  if not public.has_challenge_permission(p_challenge_id,'manage_rules') then raise exception 'لا تملك صلاحية تعديل الأهداف'; end if;
  if p_name is null or char_length(pg_catalog.btrim(p_name)) not between 2 and 80 then raise exception 'اسم الهدف غير صحيح'; end if;
  if coalesce(char_length(p_description),0)>500 or p_points not between 1 and 100 then raise exception 'الوصف أو النقاط غير صحيحة'; end if;

  select points,is_required,is_active into v_old_points,v_old_required,v_old_active
  from public.habits where id=p_goal_id and challenge_id=p_challenge_id;
  if not found then raise exception 'الهدف غير موجود في هذا التحدّي'; end if;
  if not v_old_active and p_is_active then
    raise exception 'الهدف المؤرشف لا يعاد تفعيله؛ أضف هدفاً جديداً للحفاظ على سجل الإنجازات';
  end if;

  select exists(select 1 from public.daily_logs where challenge_id=p_challenge_id)
    into v_has_activity;
  if v_has_activity and (p_points<>v_old_points or p_is_required is distinct from v_old_required) then
    raise exception 'بدأ تسجيل الإنجازات؛ لا يمكن تغيير وزن النقاط أو إلزامية هدف قائم. أوقفه وأضف هدفاً جديداً';
  end if;

  update public.habits set
    name=pg_catalog.btrim(p_name),description=coalesce(pg_catalog.btrim(p_description),''),
    points=p_points,is_required=p_is_required,
    is_active=p_is_active,
    active_until=case when not p_is_active and is_active then v_today when p_is_active then null else active_until end
  where id=p_goal_id and challenge_id=p_challenge_id;
end;
$$;
revoke all on function public.update_challenge_goal(uuid,uuid,text,text,integer,boolean,boolean) from public,anon;
grant execute on function public.update_challenge_goal(uuid,uuid,text,text,integer,boolean,boolean) to authenticated;

-- Role assignment and granular delegation stay on the server.
-- Pausing, completing or archiving a challenge stops further progress edits.
create or replace function public.validate_user_day(p_challenge_id uuid,p_user_id uuid,p_log_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $validate$
declare
  v_start date;
  v_end date;
  v_status text;
  v_today date;
begin
  if (select auth.uid()) is not null and p_user_id<>(select auth.uid()) then
    raise exception 'لا يمكنك تسجيل بيانات مستخدم آخر';
  end if;
  select c.start_date,c.end_date,c.status
    into v_start,v_end,v_status
  from public.challenges c where c.id=p_challenge_id;
  if v_start is null then raise exception 'التحدّي غير موجود'; end if;
  if v_status not in ('open','active') then
    raise exception 'التحدّي متوقف عن استقبال تسجيلات جديدة';
  end if;
  v_today:=(now() at time zone 'Africa/Algiers')::date;
  if p_log_date<v_start or p_log_date>v_end then raise exception 'التاريخ خارج فترة التحدّي'; end if;
  if p_log_date>v_today then raise exception 'لا يمكن تسجيل إنجاز ليوم لم يحدث بعد'; end if;
  if not exists (
    select 1 from public.challenge_members cm
    where cm.challenge_id=p_challenge_id and cm.user_id=p_user_id
  ) then raise exception 'المستخدم ليس عضواً في هذا التحدّي'; end if;
end;
$validate$;

-- Capture the configured point value at the moment a participant completes a goal.
-- Later edits to goal weights do not rewrite already-earned competition points or XP.
create or replace function public.validate_completion()
returns trigger
language plpgsql
set search_path = ''
as $completion$
declare
  v_fasting boolean;
  v_key text;
  v_points smallint;
begin
  perform public.validate_user_day(new.challenge_id,new.user_id,new.log_date);
  select h.is_fasting,h.habit_key,h.points
    into v_fasting,v_key,v_points
    from public.habits h
   where h.id=new.habit_id and h.challenge_id=new.challenge_id;
  if v_key is null then raise exception 'العادة غير مرتبطة بهذا التحدّي'; end if;
  if v_fasting and extract(isodow from new.log_date) not in (1,4) then
    raise exception 'هذا الهدف لا يمكن تسجيله إلا يوم الاثنين أو الخميس';
  end if;
  if v_key='chess' and new.quantity not between 1 and 2 then
    raise exception 'عدد المباريات يجب أن يكون 1 أو 2';
  end if;
  if v_key<>'chess' then new.quantity:=1; end if;
  if tg_op='INSERT' then
    new.points_awarded:=v_points;
  else
    new.points_awarded:=old.points_awarded;
  end if;
  return new;
end;
$completion$;

create or replace function public.get_challenge_members(p_challenge_id uuid)
returns table(user_id uuid,display_name text,avatar_url text,role text,permissions text[],joined_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_challenge_member(p_challenge_id) then raise exception 'لا تملك حق الوصول'; end if;
  return query
  select cm.user_id,p.display_name,p.avatar_url,cm.role,cm.permissions,cm.created_at
  from public.challenge_members cm
  join public.profiles p on p.id=cm.user_id
  where cm.challenge_id=p_challenge_id
  order by case cm.role when 'owner' then 0 when 'moderator' then 1 when 'assistant' then 2 else 3 end,cm.created_at;
end;
$$;
revoke all on function public.get_challenge_members(uuid) from public,anon;
grant execute on function public.get_challenge_members(uuid) to authenticated;

create or replace function public.set_challenge_member_access(
  p_challenge_id uuid,p_user_id uuid,p_role text,p_permissions text[]
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.challenges c where c.id=p_challenge_id and c.owner_user_id=(select auth.uid())) then
    raise exception 'تعيين الأدوار والصلاحيات متاح لمالك التحدّي فقط';
  end if;
  if p_role not in ('moderator','assistant','member') then raise exception 'الدور غير صالح'; end if;
  if not (coalesce(p_permissions, array[]::text[]) <@ array[
    'manage_members','manage_rules','manage_join_requests',
    'moderate_posts','publish_posts','view_analytics'
  ]::text[]) then raise exception 'تتضمن الصلاحيات قيمة غير معروفة'; end if;
  update public.challenge_members set role=p_role,permissions=coalesce(p_permissions,'{}')
  where challenge_id=p_challenge_id and user_id=p_user_id and user_id<>(select owner_user_id from public.challenges where id=p_challenge_id);
  if not found then raise exception 'المشارك غير موجود أو لا يمكن تعديل مالك التحدّي'; end if;
end;
$$;
revoke all on function public.set_challenge_member_access(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.set_challenge_member_access(uuid,uuid,text,text[]) to authenticated;

create or replace function public.remove_challenge_member(p_challenge_id uuid,p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (
    exists(select 1 from public.challenges c where c.id=p_challenge_id and c.owner_user_id=(select auth.uid()))
    or public.has_challenge_permission(p_challenge_id,'manage_members')
  ) then raise exception 'لا تملك صلاحية إدارة المشاركين'; end if;
  if exists(select 1 from public.challenges c where c.id=p_challenge_id and c.owner_user_id=p_user_id) then
    raise exception 'لا يمكن إزالة مالك التحدّي';
  end if;
  delete from public.challenge_members where challenge_id=p_challenge_id and user_id=p_user_id;
  if not found then raise exception 'المشارك غير موجود'; end if;
end;
$$;
revoke all on function public.remove_challenge_member(uuid,uuid) from public,anon;
grant execute on function public.remove_challenge_member(uuid,uuid) to authenticated;

-- Invitation joins also enforce lifecycle status and the challenge-wide capacity.
create or replace function public.join_challenge(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $invite$
declare
  v_challenge_id uuid;
  v_status text;
  v_member_count integer;
  v_max_members integer;
  v_hash text;
begin
  if (select auth.uid()) is null then raise exception 'سجّل الدخول أولاً'; end if;
  if p_token is null or pg_catalog.char_length(p_token)<24 then raise exception 'رمز الدعوة غير صالح'; end if;

  v_hash:=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex');
  select i.challenge_id into v_challenge_id
  from public.invitations i
  where i.token_hash=v_hash and i.expires_at>pg_catalog.now() and i.uses<i.max_uses
  for update;
  if v_challenge_id is null then raise exception 'رابط الدعوة غير صالح أو منتهي أو استُخدم مسبقاً'; end if;

  select c.status,c.member_count,c.max_members
    into v_status,v_member_count,v_max_members
  from public.challenges c where c.id=v_challenge_id
  for update;
  if not found then raise exception 'التحدّي غير موجود'; end if;
  if v_status not in ('open','active') then raise exception 'التحدّي لا يستقبل مشاركين حالياً'; end if;
  if exists (
    select 1 from public.challenge_members cm
    where cm.challenge_id=v_challenge_id and cm.user_id=(select auth.uid())
  ) then return v_challenge_id; end if;
  if v_member_count>=v_max_members then raise exception 'اكتمل العدد المسموح للمشاركين'; end if;

  update public.invitations set uses=uses+1 where token_hash=v_hash;
  insert into public.challenge_members(challenge_id,user_id,role)
  values(v_challenge_id,(select auth.uid()),'member');

  return v_challenge_id;
end;
$invite$;
revoke all on function public.join_challenge(text) from public,anon;
grant execute on function public.join_challenge(text) to authenticated;

-- Public challenges may be open, approval-based, or invite-only.
create or replace function public.request_join_challenge(p_challenge_id uuid,p_message text default '')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_mode text; v_status text; v_count integer; v_limit integer; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'سجّل الدخول أولاً'; end if;
  select join_mode,status,member_count,max_members into v_mode,v_status,v_count,v_limit
  from public.challenges where id=p_challenge_id and visibility='public' for update;
  if not found then raise exception 'التحدّي غير متاح'; end if;
  if exists(select 1 from public.challenge_members where challenge_id=p_challenge_id and user_id=(select auth.uid())) then
    raise exception 'أنت عضو بالفعل في هذا التحدّي';
  end if;
  if v_status not in ('open','active') then raise exception 'التحدّي لا يستقبل مشاركين حالياً'; end if;
  if v_count>=v_limit then raise exception 'اكتمل العدد المسموح للمشاركين'; end if;
  if v_mode='invite' then raise exception 'الانضمام يتطلب دعوة خاصة'; end if;
  if v_mode='open' then
    insert into public.challenge_members(challenge_id,user_id,role) values(p_challenge_id,(select auth.uid()),'member');
    return p_challenge_id;
  end if;
  insert into public.challenge_join_requests(challenge_id,user_id,message)
  values(p_challenge_id,(select auth.uid()),coalesce(pg_catalog.left(pg_catalog.btrim(p_message),500),''))
  on conflict(challenge_id,user_id) do update set status='pending',message=excluded.message,reviewed_by=null,reviewed_at=null
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_join_challenge(uuid,text) from public,anon;
grant execute on function public.request_join_challenge(uuid,text) to authenticated;

create or replace function public.get_challenge_join_requests(p_challenge_id uuid)
returns table(id uuid,user_id uuid,display_name text,message text,status text,created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_challenge_permission(p_challenge_id,'manage_join_requests') then raise exception 'لا تملك صلاحية مراجعة الطلبات'; end if;
  return query
  select r.id,r.user_id,p.display_name,r.message,r.status,r.created_at
  from public.challenge_join_requests r join public.profiles p on p.id=r.user_id
  where r.challenge_id=p_challenge_id and r.status='pending'
  order by r.created_at;
end;
$$;
revoke all on function public.get_challenge_join_requests(uuid) from public,anon;
grant execute on function public.get_challenge_join_requests(uuid) to authenticated;

create or replace function public.review_challenge_join_request(p_request_id uuid,p_approve boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.challenge_join_requests%rowtype;
  c public.challenges%rowtype;
  v_challenge_id uuid;
begin
  -- Lock challenge first, matching the join-request path and avoiding reversed lock order.
  select challenge_id into v_challenge_id
  from public.challenge_join_requests where id=p_request_id;
  if not found then raise exception 'الطلب غير موجود'; end if;
  select * into c from public.challenges where id=v_challenge_id for update;
  if not found then raise exception 'التحدّي غير موجود'; end if;
  select * into r from public.challenge_join_requests where id=p_request_id for update;
  if not public.has_challenge_permission(r.challenge_id,'manage_join_requests') then raise exception 'لا تملك صلاحية مراجعة الطلبات'; end if;
  if r.status<>'pending' then raise exception 'تمت مراجعة هذا الطلب سابقاً'; end if;
  if p_approve then
    if c.member_count>=c.max_members then raise exception 'اكتمل العدد المسموح للمشاركين'; end if;
    insert into public.challenge_members(challenge_id,user_id,role) values(r.challenge_id,r.user_id,'member')
    on conflict(challenge_id,user_id) do nothing;
    update public.challenge_join_requests set status='approved',reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_request_id;
  else
    update public.challenge_join_requests set status='rejected',reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_request_id;
  end if;
end;
$$;
revoke all on function public.review_challenge_join_request(uuid,boolean) from public,anon;
grant execute on function public.review_challenge_join_request(uuid,boolean) to authenticated;

-- The authenticated peer profile surface exposes only display fields to members who share a challenge.
drop policy if exists profiles_select_challenge_peers on public.profiles;
create policy profiles_select_challenge_peers on public.profiles
for select to authenticated
using (id=(select auth.uid()) or public.shares_challenge_with(id));

-- Join request access: members can see their own request; managers can see pending requests through RPC.
alter table public.challenge_join_requests enable row level security;
grant select,insert on public.challenge_join_requests to authenticated;
revoke all on public.challenge_join_requests from anon;
create policy join_requests_select_own_or_manager on public.challenge_join_requests
for select to authenticated
using (user_id=(select auth.uid()) or public.has_challenge_permission(challenge_id,'manage_join_requests'));
create policy join_requests_insert_own on public.challenge_join_requests
for insert to authenticated with check (user_id=(select auth.uid()) and exists(
  select 1 from public.challenges c
  where c.id=challenge_id and c.visibility='public'
    and c.join_mode='approval' and c.status in ('open','active')
));

alter table public.challenge_posts enable row level security;
grant select,insert,update,delete on public.challenge_posts to authenticated;
revoke all on public.challenge_posts from anon;
create policy challenge_posts_member_select on public.challenge_posts
for select to authenticated using (public.is_challenge_member(challenge_id));
create policy challenge_posts_member_insert on public.challenge_posts
for insert to authenticated with check (author_id=(select auth.uid()) and public.is_challenge_member(challenge_id));
create policy challenge_posts_author_or_moderator_delete on public.challenge_posts
for delete to authenticated using (author_id=(select auth.uid()) or public.has_challenge_permission(challenge_id,'moderate_posts'));

alter table public.challenge_comments enable row level security;
grant select,insert,update,delete on public.challenge_comments to authenticated;
revoke all on public.challenge_comments from anon;
create policy challenge_comments_member_select on public.challenge_comments
for select to authenticated using (public.is_challenge_member(challenge_id));
create policy challenge_comments_member_insert on public.challenge_comments
for insert to authenticated with check (
  author_id=(select auth.uid()) and public.is_challenge_member(challenge_id)
  and exists(select 1 from public.challenge_posts p where p.id=post_id and p.challenge_id=challenge_id)
);
create policy challenge_comments_author_or_moderator_delete on public.challenge_comments
for delete to authenticated using (author_id=(select auth.uid()) or public.has_challenge_permission(challenge_id,'moderate_posts'));

alter table public.user_achievements enable row level security;
grant select on public.user_achievements to authenticated;
grant select on public.challenge_awards to authenticated;
revoke all on public.user_achievements from anon;
create policy user_achievements_select_own on public.user_achievements
for select to authenticated using (user_id=(select auth.uid()));

alter table public.challenge_awards enable row level security;
revoke all on public.challenge_awards from anon,authenticated;
grant select on public.challenge_awards to authenticated;
create policy challenge_awards_select_own on public.challenge_awards
for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.get_my_awards()
returns table(
  challenge_id uuid,challenge_title text,place smallint,points integer,awarded_at timestamptz
)
language sql stable security definer
set search_path = ''
as $awards$
  select a.challenge_id,c.title,a.place,a.points,a.awarded_at
  from public.challenge_awards a
  join public.challenges c on c.id=a.challenge_id
  where a.user_id=(select auth.uid())
  order by a.awarded_at desc,a.place asc;
$awards$;
revoke all on function public.get_my_awards() from public,anon;
grant execute on function public.get_my_awards() to authenticated;

-- Recalculate achievement awards from actual records; XP is derived, never client-editable.
create or replace function public.refresh_user_achievements(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_tasks integer; v_xp integer; v_pages integer; v_best_streak integer;
begin
  select count(*),coalesce(sum(hc.points_awarded),0)::integer
    into v_tasks,v_xp
  from public.habit_completions hc
  where hc.user_id=p_user_id;

  select coalesce(sum(pages_read),0)::integer into v_pages
  from public.reading_logs where user_id=p_user_id;

  with days as (
    select distinct log_date from public.habit_completions where user_id=p_user_id
  ), groups as (
    select log_date,log_date-(row_number() over(order by log_date))::integer grp from days
  ), streaks as (
    select count(*)::integer n from groups group by grp
  )
  select coalesce(max(n),0) into v_best_streak from streaks;

  if v_tasks>=1 then insert into public.user_achievements(user_id,achievement_key) values(p_user_id,'first_step') on conflict do nothing; end if;
  if v_best_streak>=7 then insert into public.user_achievements(user_id,achievement_key) values(p_user_id,'streak_7') on conflict do nothing; end if;
  if v_best_streak>=30 then insert into public.user_achievements(user_id,achievement_key) values(p_user_id,'streak_30') on conflict do nothing; end if;
  if v_tasks>=100 then insert into public.user_achievements(user_id,achievement_key) values(p_user_id,'tasks_100') on conflict do nothing; end if;
  if v_pages>=100 then insert into public.user_achievements(user_id,achievement_key) values(p_user_id,'pages_100') on conflict do nothing; end if;
  if v_xp>=500 then insert into public.user_achievements(user_id,achievement_key) values(p_user_id,'xp_500') on conflict do nothing; end if;
end;
$$;
revoke all on function public.refresh_user_achievements(uuid) from public,anon,authenticated;

create or replace function public.on_progress_record_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op='DELETE' then perform public.refresh_user_achievements(old.user_id); return old; end if;
  perform public.refresh_user_achievements(new.user_id); return new;
end;
$$;
revoke all on function public.on_progress_record_changed() from public,anon,authenticated;

drop trigger if exists habit_completions_progress_refresh on public.habit_completions;
create trigger habit_completions_progress_refresh
after insert or update or delete on public.habit_completions
for each row execute function public.on_progress_record_changed();
drop trigger if exists reading_logs_progress_refresh on public.reading_logs;
create trigger reading_logs_progress_refresh
after insert or update or delete on public.reading_logs
for each row execute function public.on_progress_record_changed();

-- Backfill milestone badges from progress already stored before this migration.
do $backfill$
declare r record;
begin
  for r in
    select user_id from public.habit_completions
    union
    select user_id from public.reading_logs
  loop
    perform public.refresh_user_achievements(r.user_id);
  end loop;
end;
$backfill$;

create or replace function public.get_my_progress()
returns table(
  xp integer,completed_tasks integer,active_days integer,pages_read integer,
  best_streak integer,achievements jsonb
)
language plpgsql stable security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  return query
  with task_totals as (
    select count(*)::integer tasks,coalesce(sum(hc.points_awarded),0)::integer xp
    from public.habit_completions hc
    where hc.user_id=v_uid
  ), reading_totals as (
    select coalesce(sum(pages_read),0)::integer pages from public.reading_logs where user_id=v_uid
  ), days as (
    select distinct log_date from public.habit_completions where user_id=v_uid
  ), groups as (
    select log_date,log_date-(row_number() over(order by log_date))::integer grp from days
  ), streaks as (
    select count(*)::integer n from groups group by grp
  ), active as (
    select count(*)::integer n from days
  )
  select t.xp,t.tasks,a.n,r.pages,coalesce((select max(n) from streaks),0),
    coalesce((select jsonb_agg(jsonb_build_object('key',ua.achievement_key,'earned_at',ua.earned_at) order by ua.earned_at) from public.user_achievements ua where ua.user_id=v_uid),'[]'::jsonb)
  from task_totals t cross join reading_totals r cross join active a;
end;
$$;
revoke all on function public.get_my_progress() from public,anon;
grant execute on function public.get_my_progress() to authenticated;

-- Rebuild leaderboard scoring from each challenge's own configured goal list.
create or replace function public.get_challenge_leaderboard(p_challenge_id uuid)
returns table(
  user_id uuid,display_name text,avatar_url text,points integer,possible_points integer,
  adherence_pct numeric,full_days integer,habits_done integer,pages_read integer,best_streak integer
)
language plpgsql stable security definer
set search_path = ''
as $$
declare v_start date; v_end date; v_today date;
begin
  if not public.is_challenge_member(p_challenge_id) then raise exception 'ليس لديك صلاحية الوصول إلى هذا التحدّي'; end if;
  select start_date,end_date into v_start,v_end from public.challenges where id=p_challenge_id;
  if v_start is null then raise exception 'التحدّي غير موجود'; end if;
  v_today:=least(v_end,(now() at time zone 'Africa/Algiers')::date);
  if v_today<v_start then v_today:=v_start-1; end if;

  return query
  with calendar as (
    select gs.day_date::date day_date
    from generate_series(v_start::timestamp,v_today::timestamp,interval '1 day') gs(day_date)
    where v_today>=v_start
  ), member_days as (
    select cm.user_id,cal.day_date,
      coalesce(sum(h.points) filter(where h.id is not null),0)::integer expected_points,
      coalesce(sum(hc.points_awarded) filter(where hc.habit_id is not null),0)::integer day_points,
      count(h.id) filter(where h.is_required)::integer required_total,
      count(hc.habit_id) filter(where h.is_required)::integer required_done
    from public.challenge_members cm
    cross join calendar cal
    left join public.habits h on h.challenge_id=p_challenge_id
      and cal.day_date>=h.active_from
      and (h.active_until is null or cal.day_date<=h.active_until)
      and (not h.is_fasting or extract(isodow from cal.day_date) in (1,4))
    left join public.habit_completions hc on hc.challenge_id=p_challenge_id
      and hc.user_id=cm.user_id and hc.habit_id=h.id and hc.log_date=cal.day_date
    where cm.challenge_id=p_challenge_id
    group by cm.user_id,cal.day_date
  ), streak_days as (
    select user_id,day_date,day_date-(row_number() over(partition by user_id order by day_date))::integer grp
    from member_days where required_total>0 and required_done=required_total
  ), streaks as (
    select user_id,max(streak_count)::integer best_streak
    from (select user_id,grp,count(*) streak_count from streak_days group by user_id,grp) s
    group by user_id
  ), totals as (
    select cm.user_id,
      coalesce(sum(md.day_points),0)::integer points,
      coalesce(sum(md.expected_points),0)::integer possible_points,
      coalesce(count(*) filter(where md.required_total>0 and md.required_done=md.required_total),0)::integer full_days,
      coalesce(sum(md.day_points),0)::integer habits_done
    from public.challenge_members cm
    left join member_days md on md.user_id=cm.user_id
    where cm.challenge_id=p_challenge_id
    group by cm.user_id
  ), reading as (
    select user_id,sum(pages_read)::integer pages
    from public.reading_logs where challenge_id=p_challenge_id and log_date between v_start and v_today
    group by user_id
  )
  select t.user_id,p.display_name,p.avatar_url,t.points,t.possible_points,
    case when t.possible_points=0 then 0 else round(t.points::numeric/t.possible_points*100,1) end,
    t.full_days,t.habits_done,coalesce(r.pages,0),coalesce(s.best_streak,0)
  from totals t join public.profiles p on p.id=t.user_id
  left join reading r on r.user_id=t.user_id
  left join streaks s on s.user_id=t.user_id
  order by t.points desc,p.display_name;
end;
$$;
revoke all on function public.get_challenge_leaderboard(uuid) from public;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;


-- Remove the unused December starter challenge requested for this rollout.
-- It is deleted only when it still has no recorded activity or invitation links.
delete from public.challenges c
where c.title = 'تحدّي ديسمبر 2026'
  and c.start_date = date '2026-12-01'
  and c.end_date = date '2026-12-31'
  and not exists (select 1 from public.daily_logs d where d.challenge_id=c.id)
  and not exists (select 1 from public.habit_completions h where h.challenge_id=c.id)
  and not exists (select 1 from public.reading_logs r where r.challenge_id=c.id)
  and not exists (select 1 from public.invitations i where i.challenge_id=c.id)
  and not exists (select 1 from public.challenge_posts p where p.challenge_id=c.id);

-- Explicit Data API grants are required for newly-created public tables.
grant select,insert,delete on public.challenge_posts,public.challenge_comments to authenticated;
revoke update on public.challenge_posts,public.challenge_comments from authenticated;
grant select,insert on public.challenge_join_requests to authenticated;
grant select on public.user_achievements to authenticated;

comment on table public.challenge_posts is 'Member-only challenge feed; edits and removal are restricted to the author or delegated moderators.';
comment on table public.challenge_comments is 'Comments on challenge feed posts; visible only to challenge members.';
comment on table public.user_achievements is 'Server-awarded milestones derived from recorded challenge activity.';
