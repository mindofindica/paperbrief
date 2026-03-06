import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

let _db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.ARXIV_COACH_DB_PATH || '/root/.openclaw/state/arxiv-coach/db.sqlite';
}

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(getDbPath(), { readonly: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  published_at: string | null;
  llm_score: number | null;
  track: string | null;
  authors: string | null;
  url: string | null;
}

export interface ReadingListEntry extends Paper {
  status: string;
  priority: number;
  added_at: string | null;
  notes: string | null;
}

export interface SearchPapersOptions {
  query: string;
  track?: string | null;
  fromDate?: string | null;
  limit?: number;
}

interface SearchRow {
  arxiv_id: string;
  title: string;
  abstract: string;
  published_at: string | null;
  relevance_score: number | null;
  track: string | null;
  authors_json: string | null;
}

function buildFtsQuery(rawQuery: string): string {
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9\-]/g, ''))
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return rawQuery.trim();

  return tokens.map((t) => `"${t}"`).join(' ');
}

// Map real schema → normalised Paper shape
function rowToPaper(row: any): Paper {
  return {
    arxiv_id: row.arxiv_id,
    title: row.title,
    abstract: row.abstract ?? null,
    published_at: row.published_at ?? null,
    llm_score: row.relevance_score ?? null,
    track: row.track ?? null,
    authors: row.authors_json ?? null,
    url: row.arxiv_id ? `https://arxiv.org/abs/${row.arxiv_id}` : null,
  };
}

export function getTodaysPapers(): Paper[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Try to get papers from today's sent digest first
  const digestExists = db.prepare(
    `SELECT digest_date FROM sent_digests WHERE digest_date = ? LIMIT 1`
  ).get(today) as any;

  if (digestExists) {
    const rows = db.prepare(`
      SELECT p.*, ls.relevance_score, dp.track_name as track
      FROM digest_papers dp
      JOIN papers p ON dp.arxiv_id = p.arxiv_id
      LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
      WHERE dp.digest_date = ?
      ORDER BY ls.relevance_score DESC
    `).all(today) as any[];
    if (rows.length > 0) return rows.map(rowToPaper);
  }

  // Fallback: most recent 10 scored papers
  const rows = db.prepare(`
    SELECT p.*, ls.relevance_score,
           (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) as track
    FROM papers p
    LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    WHERE ls.relevance_score IS NOT NULL
    ORDER BY p.published_at DESC, ls.relevance_score DESC
    LIMIT 10
  `).all() as any[];

  return rows.map(rowToPaper);
}

export function searchPapers(options: SearchPapersOptions): Paper[] {
  const db = getDb();
  const trimmedQuery = options.query.trim();
  if (!trimmedQuery) return [];

  const limit = Math.min(Math.max(1, options.limit ?? 5), 20);
  const ftsQuery = buildFtsQuery(trimmedQuery);

  let sql = `
    SELECT
      p.arxiv_id,
      p.title,
      p.abstract,
      p.published_at,
      p.authors_json,
      ls.relevance_score,
      (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) AS track
    FROM papers_fts fts
    JOIN papers p ON p.arxiv_id = fts.arxiv_id
    LEFT JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
    LEFT JOIN track_matches tm ON tm.arxiv_id = p.arxiv_id
    WHERE papers_fts MATCH ?
  `;

  const params: Array<string | number> = [ftsQuery];

  if (options.track) {
    sql += ` AND tm.track_name LIKE ?`;
    params.push(`%${options.track}%`);
  }

  if (options.fromDate) {
    sql += ` AND DATE(p.published_at) >= DATE(?)`;
    params.push(options.fromDate);
  }

  sql += `
    GROUP BY p.arxiv_id
    ORDER BY
      ls.relevance_score DESC,
      COALESCE(MAX(tm.score), 0) DESC,
      rank
    LIMIT ?
  `;
  params.push(limit);

  let rows: SearchRow[] = [];
  try {
    rows = db.prepare(sql).all(...params) as SearchRow[];
  } catch {
    const fallbackQuery = trimmedQuery.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
    if (!fallbackQuery) return [];

    try {
      rows = db.prepare(sql).all(fallbackQuery, ...params.slice(1)) as SearchRow[];
    } catch {
      return [];
    }
  }

  return rows.map(rowToPaper);
}

export function getPaper(arxivId: string): Paper | undefined {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.*, ls.relevance_score,
           (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) as track
    FROM papers p
    LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    WHERE p.arxiv_id = ?
  `).get(arxivId) as any;
  return row ? rowToPaper(row) : undefined;
}

export function getReadingList(status?: string): ReadingListEntry[] {
  const db = getDb();
  const where = status && status !== 'all' ? `WHERE r.status = ?` : '';
  const params = status && status !== 'all' ? [status] : [];

  const rows = db.prepare(`
    SELECT p.*, ls.relevance_score,
           (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) as track,
           r.status, r.priority, r.created_at as added_at, r.notes
    FROM reading_list r
    JOIN papers p ON r.paper_id = p.arxiv_id
    LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    ${where}
    ORDER BY r.priority DESC, r.created_at DESC
  `).all(...params) as any[];

  return rows.map(row => ({
    ...rowToPaper(row),
    status: row.status,
    priority: row.priority,
    added_at: row.added_at ?? null,
    notes: row.notes ?? null,
  }));
}

export function writeFeedback(arxivId: string, action: string): void {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  // Upsert into paper_feedback
  db.prepare(`
    INSERT INTO paper_feedback (id, paper_id, feedback_type, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(paper_id, feedback_type) DO UPDATE SET created_at = excluded.created_at
  `).run(id, arxivId, action, now);

  // Manage reading_list
  const rlId = randomUUID();
  const statusMap: Record<string, string> = {
    read: 'reading',
    save: 'unread',
    love: 'unread',
    skip: 'done',
    meh: 'done',
  };
  const newStatus = statusMap[action];
  const priority = action === 'love' ? 8 : action === 'save' ? 5 : 0;

  if (newStatus) {
    db.prepare(`
      INSERT INTO reading_list (id, paper_id, status, priority, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET status = excluded.status, priority = MAX(reading_list.priority, excluded.priority)
    `).run(rlId, arxivId, newStatus, priority, now);
  }
}

export function updateReadingList(arxivId: string, status: string, priority?: number): void {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO reading_list (id, paper_id, status, priority, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(paper_id) DO UPDATE SET status = excluded.status, priority = excluded.priority
  `).run(id, arxivId, status, priority ?? 0, now);
}

// ---------------------------------------------------------------------------
// Digest history
// ---------------------------------------------------------------------------

export interface DigestDate {
  date: string; // YYYY-MM-DD
  paperCount: number;
}

/**
 * Returns all dates that have a sent digest, ordered newest-first.
 * Falls back to dates with scored papers if sent_digests is empty.
 */
export function getDigestDates(limit = 30): DigestDate[] {
  const db = getDb();

  // Primary: dates from sent_digests (official email sends)
  const fromDigests = db.prepare(`
    SELECT sd.digest_date as date,
           COUNT(p.arxiv_id) as paperCount
    FROM sent_digests sd
    LEFT JOIN papers p ON DATE(p.published_at) = sd.digest_date
    GROUP BY sd.digest_date
    ORDER BY sd.digest_date DESC
    LIMIT ?
  `).all(limit) as any[];

  if (fromDigests.length > 0) {
    return fromDigests.map((row) => ({
      date: row.date,
      paperCount: Number(row.paperCount),
    }));
  }

  // Fallback: any date with scored papers
  const fromPapers = db.prepare(`
    SELECT DATE(p.published_at) as date, COUNT(*) as paperCount
    FROM papers p
    JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    GROUP BY DATE(p.published_at)
    ORDER BY date DESC
    LIMIT ?
  `).all(limit) as any[];

  return fromPapers.map((row) => ({
    date: row.date,
    paperCount: Number(row.paperCount),
  }));
}

/**
 * Returns papers for a specific YYYY-MM-DD date, ordered by relevance score.
 * Uses digest_papers if available (old weekly digest format), otherwise falls
 * back to papers table filtered by published_at date.
 */
export function getPapersByDate(date: string, limit = 30): Paper[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const db = getDb();

  // Try digest_papers first (old weekly format with curated 5 papers)
  const fromDigestPapers = db.prepare(`
    SELECT p.*, ls.relevance_score, dp.track_name as track
    FROM digest_papers dp
    JOIN papers p ON dp.arxiv_id = p.arxiv_id
    LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    WHERE dp.digest_date = ?
    ORDER BY ls.relevance_score DESC
    LIMIT ?
  `).all(date, limit) as any[];

  if (fromDigestPapers.length > 0) {
    return fromDigestPapers.map(rowToPaper);
  }

  // Fallback: scored papers published on that day (daily digest)
  const fromPapers = db.prepare(`
    SELECT p.*, ls.relevance_score,
           (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) as track
    FROM papers p
    JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    WHERE DATE(p.published_at) = ?
      AND ls.relevance_score IS NOT NULL
    ORDER BY ls.relevance_score DESC, p.published_at DESC
    LIMIT ?
  `).all(date, limit) as any[];

  return fromPapers.map(rowToPaper);
}

/**
 * Returns the previous and next digest dates relative to a given date.
 */
export function getAdjacentDigestDates(date: string): { prev: string | null; next: string | null } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { prev: null, next: null };
  const db = getDb();

  const prevRow = db.prepare(`
    SELECT digest_date FROM sent_digests
    WHERE digest_date < ?
    ORDER BY digest_date DESC
    LIMIT 1
  `).get(date) as any;

  const nextRow = db.prepare(`
    SELECT digest_date FROM sent_digests
    WHERE digest_date > ?
    ORDER BY digest_date ASC
    LIMIT 1
  `).get(date) as any;

  return {
    prev: prevRow?.digest_date ?? null,
    next: nextRow?.digest_date ?? null,
  };
}

export function getRawDb(): Database.Database {
  return getDb();
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
