import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperbrief-test-'));
const dbPath = path.join(tmpDir, 'test.db');
process.env.ARXIV_COACH_DB_PATH = dbPath;

import { getTodaysPapers, getRawDb, closeDb } from '../arxiv-db';

beforeAll(() => {
  const db = getRawDb(); // creates tables via ensureTables
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT OR REPLACE INTO papers (arxiv_id, title, abstract, published_date, llm_score, track) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('2602.12345', 'Test Paper One', 'Abstract of test paper', today, 4.5, 'cs.AI');
  db.prepare(`INSERT OR REPLACE INTO papers (arxiv_id, title, abstract, published_date, llm_score, track) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('2602.12346', 'Test Paper Two', 'Another abstract', today, 3.0, 'cs.LG');
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true });
});

describe('getTodaysPapers', () => {
  it('returns papers with correct shape', () => {
    const papers = getTodaysPapers();
    expect(papers.length).toBe(2);
    expect(papers[0]).toHaveProperty('arxiv_id');
    expect(papers[0]).toHaveProperty('title');
    expect(papers[0]).toHaveProperty('abstract');
    expect(papers[0]).toHaveProperty('llm_score');
    expect(papers[0]).toHaveProperty('track');
  });

  it('returns papers sorted by score descending', () => {
    const papers = getTodaysPapers();
    expect(papers[0].llm_score).toBeGreaterThanOrEqual(papers[1].llm_score!);
  });
});
