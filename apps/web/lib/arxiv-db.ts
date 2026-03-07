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

// ──────────────────────────────────────────────
// RSS feed helpers
// ──────────────────────────────────────────────

export interface RssPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  published_at: string | null;
  llm_score: number | null;
  track: string | null;
  authors: string | null;
  url: string;
}

export interface TrackSummary {
  track: string;
  paperCount: number;
}

/**
 * Returns recent high-scored papers suitable for an RSS feed.
 *
 * @param options.track    - Filter to a specific track name (exact match).
 *                           Omit or pass undefined for all tracks.
 * @param options.limit    - Max items to return (default 50, cap 100).
 * @param options.daysBack - How many days back to look (default 14).
 * @param options.minScore - Minimum llm_score to include (default 3).
 */
export function getRssPapers(options: {
  track?: string;
  limit?: number;
  daysBack?: number;
  minScore?: number;
} = {}): RssPaper[] {
  const db = getDb();
  const { track, limit = 50, daysBack = 14, minScore = 3 } = options;
  const cappedLimit = Math.min(limit, 100);

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  let rows: any[];

  if (track) {
    // Filtered by a specific track — join directly against track_matches
    rows = db.prepare(`
      SELECT
        p.arxiv_id,
        p.title,
        p.abstract,
        p.published_at,
        ls.relevance_score,
        tm.track_name AS track,
        p.authors_json
      FROM papers p
      JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
      JOIN track_matches tm ON tm.arxiv_id = p.arxiv_id
      WHERE DATE(p.published_at) >= DATE(?)
        AND ls.relevance_score >= ?
        AND tm.track_name = ?
      GROUP BY p.arxiv_id
      ORDER BY ls.relevance_score DESC, p.published_at DESC
      LIMIT ?
    `).all(fromDateStr, minScore, track, cappedLimit) as any[];
  } else {
    // All tracks — pick the highest-scoring track per paper via correlated subquery
    rows = db.prepare(`
      SELECT
        p.arxiv_id,
        p.title,
        p.abstract,
        p.published_at,
        ls.relevance_score,
        (
          SELECT tm2.track_name
          FROM track_matches tm2
          WHERE tm2.arxiv_id = p.arxiv_id
          ORDER BY tm2.score DESC
          LIMIT 1
        ) AS track,
        p.authors_json
      FROM papers p
      JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
      WHERE DATE(p.published_at) >= DATE(?)
        AND ls.relevance_score >= ?
      ORDER BY ls.relevance_score DESC, p.published_at DESC
      LIMIT ?
    `).all(fromDateStr, minScore, cappedLimit) as any[];
  }

  return rows.map((row): RssPaper => ({
    arxiv_id: row.arxiv_id,
    title: row.title ?? '',
    abstract: row.abstract ?? null,
    published_at: row.published_at ?? null,
    llm_score: row.relevance_score ?? null,
    track: row.track ?? null,
    authors: row.authors_json ?? null,
    url: `https://arxiv.org/abs/${row.arxiv_id}`,
  }));
}

/**
 * Returns all tracks that have papers in the DB, with their paper counts.
 * Useful for rendering a "choose your track feed" UI.
 */
export function getAvailableTracks(): TrackSummary[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      tm.track_name AS track,
      COUNT(DISTINCT tm.arxiv_id) AS paperCount
    FROM track_matches tm
    GROUP BY tm.track_name
    ORDER BY paperCount DESC
  `).all() as any[];

  return rows.map((row): TrackSummary => ({
    track: row.track,
    paperCount: row.paperCount,
  }));
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
