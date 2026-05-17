-- Stores explicit graph edges between map points so one source node can branch
-- to multiple downstream markets without implying a false serial route.

create table if not exists public.map_arcs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  from_point_id uuid not null references public.map_points(id) on delete cascade,
  to_point_id uuid not null references public.map_points(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  check (from_point_id <> to_point_id),
  unique (report_id, from_point_id, to_point_id)
);

create index if not exists map_arcs_report_id_idx
  on public.map_arcs (report_id);

create index if not exists map_arcs_from_point_id_idx
  on public.map_arcs (from_point_id);

create index if not exists map_arcs_to_point_id_idx
  on public.map_arcs (to_point_id);

alter table public.map_arcs enable row level security;

grant select, insert, delete on public.map_arcs to service_role;
