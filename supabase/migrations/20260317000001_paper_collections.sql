-- Migration: paper_collections + collection_papers
-- Created: 2026-03-17 (Night Shift Session 2)
--
-- Adds a named-collection system: researchers can create named shelves of
-- papers (e.g. "LLM alignment papers", "Papers for my thesis"), add any
-- arXiv paper to them, and optionally share them publicly via a unique slug.
--
-- Tables:
--   paper_collections — collection metadata, owned by a user
--   collection_papers — junction: which papers are in which collection
--
-- RLS: service-role only (all reads/writes go through Next.js API routes).

-- ── paper_collections ──────────────────────────────────────────────────────────

create table if not exists paper_collections (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  name        text        not null
                check (char_length(name) between 1 and 100),
  description text
                check (description is null or char_length(description) <= 500),
  -- URL-friendly slug for public sharing, e.g. "llm-alignment-papers-a1b2"
  slug        text        not null unique
                check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists paper_collections_user_id_idx on paper_collections(user_id);
create index if not exists paper_collections_slug_idx   on paper_collections(slug);

alter table paper_collections enable row level security;

-- Service role has full access; no direct client access
create policy "service role full access on paper_collections"
  on paper_collections
  using (true)
  with check (true);

-- ── collection_papers ──────────────────────────────────────────────────────────

create table if not exists collection_papers (
  collection_id uuid        not null references paper_collections(id) on delete cascade,
  arxiv_id      text        not null,
  -- Snapshot of metadata at add-time so public views work without SQLite
  title         text,
  authors       text,       -- JSON array string, same format as reading_list
  abstract      text,
  published_at  text,
  added_at      timestamptz not null default now(),

  primary key (collection_id, arxiv_id)
);

create index if not exists collection_papers_collection_id_idx on collection_papers(collection_id);
create index if not exists collection_papers_arxiv_id_idx      on collection_papers(arxiv_id);

alter table collection_papers enable row level security;

create policy "service role full access on collection_papers"
  on collection_papers
  using (true)
  with check (true);

-- ── updated_at trigger ─────────────────────────────────────────────────────────

create or replace function update_updated_at_column()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger paper_collections_updated_at
  before update on paper_collections
  for each row execute procedure update_updated_at_column();
