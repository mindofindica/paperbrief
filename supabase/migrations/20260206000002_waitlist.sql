create table if not exists paperbrief_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text default 'landing',
  created_at timestamptz default now()
);

-- RLS: allow anon insert, block all reads (admin only)
alter table paperbrief_waitlist enable row level security;
create policy "anon can join waitlist" on paperbrief_waitlist
  for insert to anon with check (true);
