-- Wings World kiosk: staff phones for call alerts, and call history.
-- RLS is on with no policies: only the server (service role) can read or write.
create table if not exists public.kiosk_staff_devices (
  device text primary key,
  name text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kiosk_staff_devices enable row level security;

create table if not exists public.kiosk_events (
  id bigint generated always as identity primary key,
  type text not null,
  call_id text,
  answered_by text,
  seconds integer,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists kiosk_events_type_created on public.kiosk_events (type, created_at desc);
alter table public.kiosk_events enable row level security;
