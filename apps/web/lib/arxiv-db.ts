import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getServiceSupabase } from './supabase';

// Local SQLite — only used by server-side scripts/tools, not by the Next.js app on Vercel.
// getPaper() uses Supabase exclusively.
let _db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.ARXIV_COACH_DB_PATH || '/root/.openclaw/state/arxiv-coach/db.sqlite';
}

function requireDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(getDbPath(), { readonly: false });
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
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
  const db = requireDb();
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
  const db = requireDb();
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

export async function getPaper(arxivId: string): Promise<Paper | undefined> {
  try {
    const supabase = getServiceSupabase();
    const [paperRes, digestRes] = await Promise.all([
      supabase.from('papers').select('*').eq('arxiv_id', arxivId).single(),
      supabase
        .from('paper_digest_entries')
        .select('track, llm_score')
        .eq('arxiv_id', arxivId)
        .order('llm_score', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!paperRes.data) return undefined;
    const p = paperRes.data;
    const digest = digestRes.data;
    return {
      arxiv_id: p.arxiv_id,
      title: p.title,
      abstract: p.abstract ?? null,
      published_at: p.published_at ?? null,
      llm_score: digest?.llm_score ?? null,
      track: digest?.track ?? null,
      authors: Array.isArray(p.authors) ? JSON.stringify(p.authors) : (p.authors ?? null),
      url: `https://arxiv.org/abs/${p.arxiv_id}`,
    };
  } catch {
    return undefined;
  }
}

export function getReadingList(status?: string): ReadingListEntry[] {
  const db = requireDb();
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
  const db = requireDb();
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
  const db = requireDb();
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

// ── Weekly digest ────────────────────────────────────────────────────────────

export interface WeeklyTrackSection {
  track: string;
  papers: Paper[];
}

export interface WeeklyStats {
  totalPapers: number;
  totalTracks: number;
  topTrack: string | null;
  fromDate: string;
  toDate: string;
}

export interface WeeklyKeyword {
  keyword: string;
  count: number;
  /** Percentage change vs. prior 7-day window (null if no prior data) */
  pctChange: number | null;
  direction: 'rising' | 'falling' | 'stable';
}

// Stopwords for keyword extraction (mirrors arxiv-coach trends.ts)
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'this', 'that', 'these', 'those', 'its', 'it', 'we', 'our', 'they',
  'via', 'into', 'towards', 'toward', 'through', 'under', 'over',
  'about', 'up', 'out', 'all', 'you', 'need', 'new', 'large', 'based',
  'approach', 'method', 'methods', 'task', 'tasks', 'paper', 'papers',
  'study', 'work', 'analysis', 'evaluation', 'results', 'using', 'towards',
]);

export function extractTitleKeywords(title: string): string[] {
  const normalised = title.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = normalised.split(' ').filter(t => t.length >= 3);
  const singles = tokens.filter(t => !STOPWORDS.has(t) && !/^\d+$/.test(t));
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (!STOPWORDS.has(a) && !STOPWORDS.has(b)) {
      bigrams.push(`${a} ${b}`);
    }
  }
  return [...new Set([...singles, ...bigrams])];
}

/**
 * Returns papers from the last 7 days grouped by track, ordered by relevance.
 * Falls back to track_matches if digest_papers is sparse.
 */
export function getWeeklyPapers(): WeeklyTrackSection[] {
  const db = requireDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT DISTINCT
      p.arxiv_id,
      p.title,
      p.abstract,
      p.published_at,
      p.authors_json,
      ls.relevance_score,
      (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) AS track
    FROM papers p
    LEFT JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
    WHERE ls.relevance_score IS NOT NULL
      AND DATE(p.published_at) >= DATE(?)
    ORDER BY ls.relevance_score DESC, p.published_at DESC
  `).all(fromDate) as any[];

  // Group by track
  const trackMap = new Map<string, Paper[]>();
  for (const row of rows) {
    const track = row.track ?? 'Other';
    if (!trackMap.has(track)) trackMap.set(track, []);
    trackMap.get(track)!.push(rowToPaper(row));
  }

  // Sort tracks by paper count descending
  return Array.from(trackMap.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([track, papers]) => ({ track, papers }));
}

// ---------------------------------------------------------------------------
// Digest history
// ---------------------------------------------------------------------------

export interface DigestDate {
  date: string; // YYYY-MM-DD
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
  const db = requireDb();
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
 * Returns all dates that have a sent digest, ordered newest-first.
 * Falls back to dates with scored papers if sent_digests is empty.
 */
export function getDigestDates(limit = 30): DigestDate[] {
  const db = requireDb();

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
 * Returns all tracks that have papers in the DB, with their paper counts.
 * Useful for rendering a "choose your track feed" UI.
 */
export function getAvailableTracks(): TrackSummary[] {
  const db = requireDb();
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

/**
 * Returns papers for a specific YYYY-MM-DD date, ordered by relevance score.
 * Uses digest_papers if available (old weekly digest format), otherwise falls
 * back to papers table filtered by published_at date.
 */
export function getPapersByDate(date: string, limit = 30): Paper[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const db = requireDb();

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
  const db = requireDb();

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

export function removeFromReadingList(arxivId: string): void {
  const db = requireDb();
  db.prepare(`
    DELETE FROM reading_list
    WHERE paper_id = ?
  `).run(arxivId);
}

export function getRecommendationBasis(): 'your feedback' | 'top papers' {
  const db = requireDb();
  const row = db.prepare(`
    SELECT 1
    FROM paper_feedback
    WHERE feedback_type IN ('love', 'save')
    LIMIT 1
  `).get() as { 1: number } | undefined;

  return row ? 'your feedback' : 'top papers';
}

export function getRecommendations(limit = 20): Paper[] {
  const db = requireDb();
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const basedOnFeedback = getRecommendationBasis() === 'your feedback';

  if (!basedOnFeedback) {
    const fallbackRows = db.prepare(`
      SELECT
        p.arxiv_id,
        p.title,
        p.abstract,
        p.published_at,
        p.authors_json,
        ls.relevance_score,
        (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) AS track
      FROM papers p
      LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
      ORDER BY ls.relevance_score DESC, p.published_at DESC
      LIMIT ?
    `).all(safeLimit) as any[];

    return fallbackRows.map(rowToPaper);
  }

  const preferredTrackRows = db.prepare(`
    SELECT DISTINCT tm.track_name
    FROM paper_feedback pf
    JOIN track_matches tm ON pf.paper_id = tm.arxiv_id
    WHERE pf.feedback_type IN ('love', 'save')
  `).all() as Array<{ track_name: string }>;

  const preferredTracks = preferredTrackRows.map((row) => row.track_name);
  const placeholders = preferredTracks.map(() => '?').join(', ') || "''";
  const allowAllTracks = preferredTracks.length === 0 ? 1 : 0;
  const sql = `
    SELECT
      p.arxiv_id,
      p.title,
      p.abstract,
      p.published_at,
      p.authors_json,
      ls.relevance_score,
      (
        SELECT tm2.track_name
        FROM track_matches tm2
        WHERE tm2.arxiv_id = p.arxiv_id
          AND (? = 1 OR tm2.track_name IN (${placeholders}))
        ORDER BY tm2.score DESC
        LIMIT 1
      ) AS track
    FROM papers p
    LEFT JOIN llm_scores ls ON p.arxiv_id = ls.arxiv_id
    WHERE p.arxiv_id NOT IN (SELECT paper_id FROM paper_feedback)
      AND p.arxiv_id NOT IN (SELECT paper_id FROM reading_list)
      AND (
        ? = 1 OR EXISTS (
          SELECT 1
          FROM track_matches tm3
          WHERE tm3.arxiv_id = p.arxiv_id
            AND tm3.track_name IN (${placeholders})
        )
      )
    ORDER BY ls.relevance_score DESC, p.published_at DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(
    allowAllTracks,
    ...preferredTracks,
    allowAllTracks,
    ...preferredTracks,
    safeLimit
  ) as any[];
  return rows.map(rowToPaper);
}

/**
 * Returns summary stats for the past 7 days.
 */
export function getWeeklyStats(): WeeklyStats {
  const db = requireDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fromDate = sevenDaysAgo.toISOString().slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);

  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT p.arxiv_id) AS totalPapers,
      COUNT(DISTINCT (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id LIMIT 1)) AS totalTracks
    FROM papers p
    JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
    WHERE ls.relevance_score IS NOT NULL
      AND DATE(p.published_at) >= DATE(?)
  `).get(fromDate) as any;

  // Find top track
  const topTrackRow = db.prepare(`
    SELECT
      (SELECT track_name FROM track_matches WHERE arxiv_id = p.arxiv_id ORDER BY score DESC LIMIT 1) AS track,
      COUNT(*) AS cnt
    FROM papers p
    JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
    WHERE ls.relevance_score IS NOT NULL
      AND DATE(p.published_at) >= DATE(?)
    GROUP BY track
    ORDER BY cnt DESC
    LIMIT 1
  `).get(fromDate) as any;

  return {
    totalPapers: row?.totalPapers ?? 0,
    totalTracks: row?.totalTracks ?? 0,
    topTrack: topTrackRow?.track ?? null,
    fromDate,
    toDate,
  };
}

/**
 * Analyse keyword frequency trends for the past 7 days vs the prior 7 days.
 * Returns top trending keywords with direction and % change.
 */
export function getWeeklyKeywordTrends(limit = 15): WeeklyKeyword[] {
  const db = requireDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  const recentFrom = sevenDaysAgo.toISOString().slice(0, 10);
  const priorFrom = fourteenDaysAgo.toISOString().slice(0, 10);

  // Papers in the recent 7 days
  const recentRows = db.prepare(`
    SELECT p.title, ls.relevance_score
    FROM papers p
    JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
    WHERE ls.relevance_score IS NOT NULL
      AND DATE(p.published_at) >= DATE(?)
    ORDER BY ls.relevance_score DESC
  `).all(recentFrom) as any[];

  // Papers in the prior 7 days
  const priorRows = db.prepare(`
    SELECT p.title, ls.relevance_score
    FROM papers p
    JOIN llm_scores ls ON ls.arxiv_id = p.arxiv_id
    WHERE ls.relevance_score IS NOT NULL
      AND DATE(p.published_at) >= DATE(?)
      AND DATE(p.published_at) < DATE(?)
    ORDER BY ls.relevance_score DESC
  `).all(priorFrom, recentFrom) as any[];

  function countKeywords(rows: any[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const keywords = extractTitleKeywords(row.title);
      for (const kw of keywords) {
        counts.set(kw, (counts.get(kw) ?? 0) + 1);
      }
    }
    return counts;
  }

  const recentCounts = countKeywords(recentRows);
  const priorCounts = countKeywords(priorRows);

  const results: WeeklyKeyword[] = [];

  for (const [keyword, count] of recentCounts) {
    if (count < 2) continue; // require at least 2 mentions to surface
    const priorCount = priorCounts.get(keyword) ?? 0;

    let pctChange: number | null = null;
    let direction: WeeklyKeyword['direction'] = 'stable';

    if (priorCount === 0) {
      pctChange = null; // Newly emerged
      direction = 'rising';
    } else {
      pctChange = Math.round(((count - priorCount) / priorCount) * 100);
      if (pctChange >= 30) direction = 'rising';
      else if (pctChange <= -30) direction = 'falling';
      else direction = 'stable';
    }

    results.push({ keyword, count, pctChange, direction });
  }

  // Sort: rising first by count, then stable, then falling; within each by count
  results.sort((a, b) => {
    const dirOrder = { rising: 0, stable: 1, falling: 2 };
    const dirDiff = dirOrder[a.direction] - dirOrder[b.direction];
    if (dirDiff !== 0) return dirDiff;
    return b.count - a.count;
  });

  return results.slice(0, limit);
}

export function getRawDb(): Database.Database {
  return requireDb();
}

export interface SitemapPaper {
  arxiv_id: string;
  published_at: string | null;
  updated_at: string | null;
}

/**
 * Returns paper IDs and dates for sitemap generation.
 * Scoped to scored papers from the last `daysBack` days (default 180).
 * Capped at `limit` rows (default 5000) to keep the sitemap manageable.
 */
export async function getSitemapPapers(
  daysBack = 180,
  limit = 5000,
): Promise<SitemapPaper[]> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('papers')
    .select('arxiv_id, published_at')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r: { arxiv_id: string; published_at: string }) => ({
    arxiv_id: r.arxiv_id,
    published_at: r.published_at,
    updated_at: r.published_at,
  }));
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
