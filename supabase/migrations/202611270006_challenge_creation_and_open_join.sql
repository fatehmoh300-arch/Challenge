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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 3 and 80 then
    raise exception 'اسم التحدّي يجب أن يكون بين 3 و80 حرفاً';
  end if;
  if coalesce(char_length(p_description), 0) > 2000 then
    raise exception 'الوصف لا يمكن أن يتجاوز 2000 حرف';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'فترة التحدّي غير صحيحة';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'نوع الخصوصية غير صحيح';
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'مستوى الصعوبة غير صحيح';
  end if;
  if p_join_mode not in ('open', 'invite') then
    raise exception 'طريقة الانضمام غير مدعومة حالياً';
  end if;
  if p_visibility = 'private' and p_join_mode <> 'invite' then
    raise exception 'التحدّي الخاص يتطلب الانضمام بالدعوة';
  end if;
  if p_max_members not between 2 and 500 then
    raise exception 'عدد المشاركين يجب أن يكون بين 2 و500';
  end if;

  insert into public.challenges (
    title, description, category, difficulty, visibility, status,
    join_mode, max_members, owner_user_id, start_date, end_date
  )
  values (
    trim(p_title), coalesce(trim(p_description), ''), coalesce(nullif(trim(p_category), ''), 'عام'),
    p_difficulty, p_visibility,
    case when p_visibility = 'public' and p_start_date > v_today then 'open' else 'active' end,
    p_join_mode, p_max_members, auth.uid(), p_start_date, p_end_date
  )
  returning id into v_challenge_id;

  insert into public.challenge_members(challenge_id, user_id, role)
  values (v_challenge_id, auth.uid(), 'owner');

  -- Keep the existing habit workflow working while the generic goal engine is built.
  insert into public.habits(challenge_id,habit_key,name,description,sort_order,is_fasting) values
    (v_challenge_id,'fajr','صلاة الفجر','أداء صلاة الفجر في وقتها.',1,false),
    (v_challenge_id,'exercise','الرياضة','مشي لمدة 15 إلى 20 دقيقة، ولو بخطوات خفيفة.',2,false),
    (v_challenge_id,'chess','الشطرنج','لعب مباراة أو مباراتين كحد أقصى.',3,false),
    (v_challenge_id,'project','المشروع','العمل على مهمة واضحة لمدة لا تقل عن 25 دقيقة.',4,false),
    (v_challenge_id,'reading','القراءة','قراءة الحصة اليومية من الكتاب.',5,false),
    (v_challenge_id,'fasting','الصيام','صيام يوم الاثنين أو الخميس لمن يستطيع.',6,true);

  return v_challenge_id;
end;
$$;

revoke all on function public.create_challenge_v2(text,text,date,date,text,text,text,text,integer) from public, anon;
grant execute on function public.create_challenge_v2(text,text,date,date,text,text,text,text,integer) to authenticated;

create or replace function public.join_public_challenge(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_join_mode text;
  v_status text;
  v_member_count integer;
  v_max_members integer;
begin
  if auth.uid() is null then
    raise exception 'سجّل الدخول أولاً';
  end if;

  select visibility, join_mode, status, member_count, max_members
  into v_visibility, v_join_mode, v_status, v_member_count, v_max_members
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found or v_visibility <> 'public' then
    raise exception 'التحدّي غير متاح';
  end if;
  if exists (
    select 1 from public.challenge_members
    where challenge_id = p_challenge_id and user_id = auth.uid()
  ) then
    return p_challenge_id;
  end if;
  if v_join_mode <> 'open' then
    raise exception 'هذا التحدّي لا يقبل الانضمام المفتوح';
  end if;
  if v_status not in ('open', 'active') then
    raise exception 'التحدّي لا يستقبل مشاركين حالياً';
  end if;
  if v_member_count >= v_max_members then
    raise exception 'وصل التحدّي إلى الحد الأقصى للمشاركين';
  end if;

  insert into public.challenge_members(challenge_id, user_id, role)
  values (p_challenge_id, auth.uid(), 'member');

  return p_challenge_id;
end;
$$;

revoke all on function public.join_public_challenge(uuid) from public, anon;
grant execute on function public.join_public_challenge(uuid) to authenticated;