-- Enable extensions
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- PROFILES
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organisation text not null,
  role text not null check (role in ('admin','submitter')),
  created_at timestamptz default now()
);

-- PERIODS (immutable generated expression for period_code)
create table if not exists public.periods (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  period_code text generated always as ((year::text || '-' || lpad(month::text, 2, '0'))) stored,
  status text not null default 'open' check (status in ('open','finalising','finalised')),
  report_pdf_path text,
  created_at timestamptz default now(),
  unique (year, month)
);

-- METRICS
create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  unit text not null default 'count',
  grouping text,
  sort_order int default 100
);

-- SUBMISSIONS
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  organisation text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','locked')),
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (period_id, organisation)
);

-- SUBMISSION VALUES
create table if not exists public.submission_values (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  metric_id uuid not null references public.metrics(id),
  value numeric not null check (value >= 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz default now(),
  unique (submission_id, metric_id)
);

-- AUDIT
create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid not null references auth.users(id),
  action text not null,
  table_name text not null,
  record_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_values enable row level security;
alter table public.periods enable row level security;

-- Admin check helper
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.profiles p where p.user_id = uid and p.role = 'admin'
  );
$$;

-- Policies
create policy "profiles self or admin read"
  on public.profiles for select
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "submissions read"
  on public.submissions for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));

create policy "submissions insert self"
  on public.submissions for insert
  with check (owner_id = auth.uid());

create policy "submissions update windowed"
  on public.submissions for update
  using (
    public.is_admin(auth.uid())
    or owner_id = auth.uid()
  );

create policy "values read"
  on public.submission_values for select
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_values.submission_id
      and (s.owner_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "values write"
  on public.submission_values for all
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_values.submission_id
      and (
        public.is_admin(auth.uid())
        or s.owner_id = auth.uid()
      )
    )
  )
  with check (true);
