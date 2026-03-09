-- Paper Notes
-- Allows users to annotate any paper with their own thoughts, quotes, and follow-up questions.

create table if not exists paper_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  arxiv_id    text not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for fetching all notes for a user+paper
create index if not exists paper_notes_user_arxiv on paper_notes (user_id, arxiv_id);

-- Index for counting notes per paper for a user (reading-list badge)
create index if not exists paper_notes_user on paper_notes (user_id);

-- RLS: enable and lock to service role (we auth server-side via pb_session cookie)
alter table paper_notes enable row level security;
-- Service role bypasses RLS; anon cannot read/write.
