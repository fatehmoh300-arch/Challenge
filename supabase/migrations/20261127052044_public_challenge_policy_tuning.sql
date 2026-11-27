-- Avoid duplicate permissive SELECT policies for authenticated members.
drop policy if exists challenge_select_member on public.challenges;
create policy challenge_select_member
on public.challenges
for select
to authenticated
using (
  public.is_challenge_member(id)
  or (
    visibility = 'public'
    and status in ('open', 'active', 'paused', 'completed')
  )
);

-- Anonymous visitors receive only the public catalog rows and granted columns.
drop policy if exists challenge_select_public on public.challenges;
create policy challenge_select_public
on public.challenges
for select
to anon
using (
  visibility = 'public'
  and status in ('open', 'active', 'paused', 'completed')
);