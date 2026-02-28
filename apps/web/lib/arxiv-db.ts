import Database from 'better-sqlite3';
import path from 'path';

let _db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.ARXIV_COACH_DB_PATH || '/root/.openclaw/state/arxiv-coach/arxiv-coach.db';
}

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(getDbPath());
    _db.pragma('journal_mode = WAL');
    ensureTables(_db);
  }
  return _db;
}

function ensureTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      arxiv_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      abstract TEXT,
      published_date TEXT,
      llm_score REAL,
      track TEXT,
      authors TEXT,
      url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reading_list (
      arxiv_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'unread',
      priority INTEGER DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (arxiv_id) REFERENCES papers(arxiv_id)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arxiv_id TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (arxiv_id) REFERENCES papers(arxiv_id)
    );
    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      paper_count INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS digest_papers (
      digest_id INTEGER,
      arxiv_id TEXT,
      PRIMARY KEY (digest_id, arxiv_id)
    );
  `);
}

export interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  published_date: string | null;
  llm_score: number | null;
  track: string | null;
  authors: string | null;
  url: string | null;
}

export interface ReadingListEntry extends Paper {
  status: string;
  priority: number;
  added_at: string | null;
}

export function getTodaysPapers(): Paper[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  // Try today first, fall back to most recent date with papers
  let papers = db.prepare(
    `SELECT * FROM papers WHERE published_date = ? ORDER BY llm_score DESC`
  ).all(today) as Paper[];

  if (papers.length === 0) {
    papers = db.prepare(
      `SELECT * FROM papers ORDER BY published_date DESC, llm_score DESC LIMIT 50`
    ).all() as Paper[];
  }
  return papers;
}

export function getPaper(arxivId: string): Paper | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM papers WHERE arxiv_id = ?`).get(arxivId) as Paper | undefined;
}

export function getReadingList(status?: string): ReadingListEntry[] {
  const db = getDb();
  if (status && status !== 'all') {
    return db.prepare(
      `SELECT p.*, r.status, r.priority, r.added_at FROM reading_list r JOIN papers p ON r.arxiv_id = p.arxiv_id WHERE r.status = ? ORDER BY r.priority DESC, r.added_at DESC`
    ).all(status) as ReadingListEntry[];
  }
  return db.prepare(
    `SELECT p.*, r.status, r.priority, r.added_at FROM reading_list r JOIN papers p ON r.arxiv_id = p.arxiv_id ORDER BY r.priority DESC, r.added_at DESC`
  ).all() as ReadingListEntry[];
}

export function writeFeedback(arxivId: string, action: string): void {
  const db = getDb();
  db.prepare(`INSERT INTO feedback (arxiv_id, action) VALUES (?, ?)`).run(arxivId, action);

  // Auto-manage reading list based on action
  const statusMap: Record<string, string> = {
    read: 'reading',
    save: 'unread',
    love: 'unread',
    skip: 'done',
    meh: 'done',
  };
  const newStatus = statusMap[action];
  if (newStatus) {
    db.prepare(
      `INSERT INTO reading_list (arxiv_id, status, priority) VALUES (?, ?, ?)
       ON CONFLICT(arxiv_id) DO UPDATE SET status = excluded.status, priority = excluded.priority`
    ).run(arxivId, newStatus, action === 'love' ? 2 : action === 'save' ? 1 : 0);
  }
}

export function updateReadingList(arxivId: string, status: string, priority?: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO reading_list (arxiv_id, status, priority) VALUES (?, ?, ?)
     ON CONFLICT(arxiv_id) DO UPDATE SET status = excluded.status, priority = excluded.priority`
  ).run(arxivId, status, priority ?? 0);
}

// For testing - get the raw db connection
export function getRawDb(): Database.Database {
  return getDb();
}

// For testing - close and reset db connection
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
