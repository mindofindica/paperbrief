import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperbrief-feedback-'));
const dbPath = path.join(tmpDir, 'test.db');
process.env.ARXIV_COACH_DB_PATH = dbPath;

import { writeFeedback, getReadingList, getRawDb, closeDb } from '../arxiv-db';

beforeAll(() => {
  const db = getRawDb();
  db.prepare(`INSERT OR REPLACE INTO papers (arxiv_id, title) VALUES (?, ?)`).run('2602.99999', 'Feedback Test Paper');
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true });
});

describe('writeFeedback', () => {
  it('writes feedback and adds to reading list with save action', () => {
    writeFeedback('2602.99999', 'save');
    const list = getReadingList('unread');
    const item = list.find(p => p.arxiv_id === '2602.99999');
    expect(item).toBeDefined();
    expect(item!.status).toBe('unread');
    expect(item!.priority).toBe(1);
  });

  it('updates status to done for skip action', () => {
    writeFeedback('2602.99999', 'skip');
    const list = getReadingList('done');
    const item = list.find(p => p.arxiv_id === '2602.99999');
    expect(item).toBeDefined();
    expect(item!.status).toBe('done');
  });

  it('sets high priority for love action', () => {
    writeFeedback('2602.99999', 'love');
    const list = getReadingList('unread');
    const item = list.find(p => p.arxiv_id === '2602.99999');
    expect(item).toBeDefined();
    expect(item!.priority).toBe(2);
  });

  it('records feedback entries in feedback table', () => {
    const db = getRawDb();
    const count = db.prepare(`SELECT COUNT(*) as c FROM feedback WHERE arxiv_id = ?`).get('2602.99999') as { c: number };
    expect(count.c).toBeGreaterThanOrEqual(3); // save + skip + love
  });
});
