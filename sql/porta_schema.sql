-- PORTA clean schema + RLS (idempotent)

-- PROFILES
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text check (role in ('admin','submitter')) not null default 'submitter',
  organisation text not null
);

-- SUBMISSIONS
do $$ begin
  if not exists (select 1 from pg_type where typname = 'submission_status') then
    create type submission_status as enum ('draft','submitted','locked');
  end if;
end $$;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  period_code text not null,          -- 'YYYY-MM'
  organisation text not null,
  values jsonb not null default '{}'::jsonb,  -- {dist_nsw,..., dist_total}
  status submission_status not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_period_org_idx on public.submissions (period_code, organisation);
create index if not exists submissions_org_idx on public.submissions (organisation);

-- helpers
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable as $$
  select role = 'admin' from public.profiles where user_id = uid
$$;

create or replace function public.can_submit_now(period text)
returns boolean language sql stable as $$
  -- Submit window: days 1–7 for the previous month
  select date_part('day', now()) <= 7
         and period = to_char((now() - interval '1 month'),'YYYY-MM')
$$;

-- RLS
alter table public.profiles   enable row level security;
alter table public.submissions enable row level security;

drop policy if exists "profiles self or admin" on public.profiles;
create policy "profiles self or admin"
on public.profiles for select
to authenticated
using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role='admin')
);

drop policy if exists "submissions read" on public.submissions;
create policy "submissions read"
on public.submissions for select
to authenticated
using (
  public.is_admin(auth.uid())
  or organisation = (select organisation from public.profiles where user_id = auth.uid())
);

drop policy if exists "submitters insert" on public.submissions;
create policy "submitters insert"
on public.submissions for insert
to authenticated
with check (
  not public.is_admin(auth.uid())
  and organisation = (select organisation from public.profiles where user_id = auth.uid())
  and created_by = auth.uid()
  and public.can_submit_now(period_code)
);

drop policy if exists "submitters update draft" on public.submissions;
create policy "submitters update draft"
on public.submissions for update
to authenticated
using (
  not public.is_admin(auth.uid())
  and organisation = (select organisation from public.profiles where user_id = auth.uid())
  and created_by = auth.uid()
  and status in ('draft')
  and public.can_submit_now(period_code)
)
with check (
  status in ('draft','submitted')
  and public.can_submit_now(period_code)
);

drop policy if exists "admins full writes" on public.submissions;
create policy "admins full writes"
on public.submissions for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
