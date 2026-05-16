-- Agent swarm: persistence for onboarding answers, source cache, feature bundles,
-- report lifecycle status, and a unique index to keep parallel agent upserts safe.

alter table public.reports
  add column if not exists status text not null default 'running'
  check (status in ('running', 'ready', 'failed'));

create table if not exists public.onboarding_answers (
  report_id uuid primary key references public.reports(id) on delete cascade,
  industry text,
  countries text[] not null default '{}',
  time_window_months integer not null default 12 check (time_window_months in (3, 6, 12, 24)),
  reporter_persona text not null default 'NGO' check (reporter_persona in ('NGO', 'Compliance', 'Advocate')),
  output_goal text not null default 'complaint' check (output_goal in ('complaint', 'compliance'))
);

create table if not exists public.source_cache (
  source text not null,
  key text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (source, key)
);

create index if not exists source_cache_fetched_at_idx on public.source_cache (fetched_at);

create table if not exists public.feature_bundles (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  version text not null,
  bundle jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists feature_bundles_report_id_idx on public.feature_bundles (report_id);

create unique index if not exists source_status_report_name_idx
  on public.source_status (report_id, name);
