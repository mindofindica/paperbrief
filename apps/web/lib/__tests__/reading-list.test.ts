import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperbrief-readlist-'));
const dbPath = path.join(tmpDir, 'test.db');
process.env.ARXIV_COACH_DB_PATH = dbPath;

import { getReadingList, updateReadingList, getRawDb, closeDb } from '../arxiv-db';

beforeAll(() => {
  const db = getRawDb();
  db.prepare(`INSERT OR REPLACE INTO papers (arxiv_id, title, track) VALUES (?, ?, ?)`).run('2602.10001', 'Paper A', 'cs.AI');
  db.prepare(`INSERT OR REPLACE INTO papers (arxiv_id, title, track) VALUES (?, ?, ?)`).run('2602.10002', 'Paper B', 'cs.LG');
  db.prepare(`INSERT OR REPLACE INTO papers (arxiv_id, title, track) VALUES (?, ?, ?)`).run('2602.10003', 'Paper C', 'cs.CV');
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true });
});

describe('getReadingList', () => {
  it('returns empty list initially', () => {
    const list = getReadingList();
    expect(list).toEqual([]);
  });

  it('returns items after adding to reading list', () => {
    updateReadingList('2602.10001', 'unread', 1);
    updateReadingList('2602.10002', 'reading', 0);
    updateReadingList('2602.10003', 'done', 0);
    const all = getReadingList();
    expect(all.length).toBe(3);
  });

  it('filters by status', () => {
    expect(getReadingList('unread').length).toBe(1);
    expect(getReadingList('reading').length).toBe(1);
    expect(getReadingList('done').length).toBe(1);
  });

  it('returns all when status is "all"', () => {
    expect(getReadingList('all').length).toBe(3);
  });
});
