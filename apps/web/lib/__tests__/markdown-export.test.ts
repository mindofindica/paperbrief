/**
 * markdown-export.test.ts
 *
 * Tests for lib/markdown-export.ts
 *
 * Covers:
 *  formatAuthorsMd():
 *   - returns "Unknown Authors" for null
 *   - parses JSON array → comma-separated
 *   - truncates at 5 with "+N more"
 *   - falls back to raw string for non-JSON
 *
 *  formatPublishedAt():
 *   - returns "Unknown date" for null
 *   - formats YYYY-MM-DD as "Jan 2026"
 *   - handles all months correctly
 *
 *  escapeMd():
 *   - passes clean text through
 *   - escapes special Markdown characters
 *
 *  paperToMarkdown():
 *   - includes title as H3
 *   - includes arxiv link
 *   - includes abstract when includeAbstracts=true (default)
 *   - omits abstract when includeAbstracts=false
 *   - includes personal note when includeNotes=true (default)
 *   - omits personal note when includeNotes=false
 *   - omits track/score/priority/note when they are null
 *
 *  readingListToMarkdown():
 *   - returns empty-state string for empty list
 *   - includes header with paper count
 *   - groups papers by status when groupByStatus=true
 *   - skips empty status sections
 *   - produces flat list when groupByStatus=false
 *   - sorts by saved_at descending within each group
 */

import { describe, it, expect } from 'vitest';
import {
  formatAuthorsMd,
  formatPublishedAt,
  escapeMd,
  paperToMarkdown,
  readingListToMarkdown,
} from '../markdown-export';
import type { ReadingListPaper } from '../reading-list-supa';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePaper(overrides: Partial<ReadingListPaper> = {}): ReadingListPaper {
  return {
    arxiv_id: '2401.00001',
    title: 'Attention Is All You Need',
    abstract: 'We propose a new simple network architecture...',
    authors: JSON.stringify(['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar']),
    track: 'LLM Fundamentals',
    llm_score: 9,
    published_at: '2017-06-12',
    status: 'unread',
    priority: 5,
    note: null,
    saved_at: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

// ── formatAuthorsMd ───────────────────────────────────────────────────────────

describe('formatAuthorsMd', () => {
  it('returns "Unknown Authors" for null', () => {
    expect(formatAuthorsMd(null)).toBe('Unknown Authors');
  });

  it('parses a JSON array of names', () => {
    const result = formatAuthorsMd('["Alice Smith","Bob Jones"]');
    expect(result).toBe('Alice Smith, Bob Jones');
  });

  it('handles a single author', () => {
    expect(formatAuthorsMd('["Solo Author"]')).toBe('Solo Author');
  });

  it('truncates at 5 authors with "+N more"', () => {
    const authors = JSON.stringify(['A','B','C','D','E','F','G']);
    const result = formatAuthorsMd(authors);
    expect(result).toContain('+2 more');
    expect(result).toMatch(/^A, B, C, D, E, \+2 more$/);
  });

  it('returns raw string for non-JSON input', () => {
    expect(formatAuthorsMd('Alice Smith, Bob Jones')).toBe('Alice Smith, Bob Jones');
  });

  it('returns "Unknown Authors" for empty JSON array', () => {
    expect(formatAuthorsMd('[]')).toBe('Unknown Authors');
  });
});

// ── formatPublishedAt ─────────────────────────────────────────────────────────

describe('formatPublishedAt', () => {
  it('returns "Unknown date" for null', () => {
    expect(formatPublishedAt(null)).toBe('Unknown date');
  });

  it('formats YYYY-MM-DD as "MonthName YYYY"', () => {
    expect(formatPublishedAt('2026-01-15')).toBe('Jan 2026');
    expect(formatPublishedAt('2025-12-01')).toBe('Dec 2025');
    expect(formatPublishedAt('2024-07-20')).toBe('Jul 2024');
  });

  it('handles all 12 months', () => {
    const expected = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m = 1; m <= 12; m++) {
      const padded = String(m).padStart(2, '0');
      expect(formatPublishedAt(`2026-${padded}-01`)).toBe(`${expected[m-1]} 2026`);
    }
  });

  it('handles ISO timestamp format', () => {
    expect(formatPublishedAt('2026-03-17T12:00:00Z')).toBe('Mar 2026');
  });
});

// ── escapeMd ──────────────────────────────────────────────────────────────────

describe('escapeMd', () => {
  it('passes clean text through unchanged', () => {
    expect(escapeMd('Hello World')).toBe('Hello World');
  });

  it('escapes backtick', () => {
    expect(escapeMd('`code`')).toContain('\\`');
  });

  it('escapes asterisk', () => {
    expect(escapeMd('bold *text*')).toContain('\\*');
  });

  it('escapes square brackets', () => {
    expect(escapeMd('[link]')).toContain('\\[');
  });

  it('escapes hash', () => {
    expect(escapeMd('# heading')).toContain('\\#');
  });
});

// ── paperToMarkdown ───────────────────────────────────────────────────────────

describe('paperToMarkdown', () => {
  it('includes paper title as H3', () => {
    const md = paperToMarkdown(makePaper());
    expect(md).toMatch(/^### /m);
    expect(md).toContain('Attention Is All You Need');
  });

  it('includes arxiv link with correct URL', () => {
    const md = paperToMarkdown(makePaper({ arxiv_id: '2401.00001' }));
    expect(md).toContain('https://arxiv.org/abs/2401.00001');
    expect(md).toContain('[2401.00001]');
  });

  it('includes abstract by default', () => {
    const md = paperToMarkdown(makePaper({ abstract: 'Test abstract' }));
    expect(md).toContain('Test abstract');
  });

  it('omits abstract when includeAbstracts=false', () => {
    const md = paperToMarkdown(makePaper({ abstract: 'Test abstract' }), { includeAbstracts: false });
    expect(md).not.toContain('Test abstract');
  });

  it('includes personal note by default', () => {
    const md = paperToMarkdown(makePaper({ note: 'My personal note' }));
    expect(md).toContain('My personal note');
  });

  it('omits personal note when includeNotes=false', () => {
    const md = paperToMarkdown(makePaper({ note: 'My personal note' }), { includeNotes: false });
    expect(md).not.toContain('My personal note');
  });

  it('omits track line when track is null', () => {
    const md = paperToMarkdown(makePaper({ track: null }));
    expect(md).not.toContain('**Track:**');
  });

  it('includes track when present', () => {
    const md = paperToMarkdown(makePaper({ track: 'LLM Fundamentals' }));
    expect(md).toContain('**Track:** LLM Fundamentals');
  });

  it('includes llm_score when present', () => {
    const md = paperToMarkdown(makePaper({ llm_score: 8 }));
    expect(md).toContain('**Score:** 8/10');
  });

  it('omits score line when llm_score is null', () => {
    const md = paperToMarkdown(makePaper({ llm_score: null }));
    expect(md).not.toContain('**Score:**');
  });

  it('includes status with emoji', () => {
    const mdUnread  = paperToMarkdown(makePaper({ status: 'unread' }));
    const mdReading = paperToMarkdown(makePaper({ status: 'reading' }));
    const mdDone    = paperToMarkdown(makePaper({ status: 'done' }));
    expect(mdUnread).toContain('📬');
    expect(mdReading).toContain('📖');
    expect(mdDone).toContain('✅');
  });

  it('ends with HR separator', () => {
    const md = paperToMarkdown(makePaper());
    expect(md.trim()).toMatch(/---\s*$/);
  });
});

// ── readingListToMarkdown ─────────────────────────────────────────────────────

describe('readingListToMarkdown', () => {
  it('returns empty-state string for empty list', () => {
    const md = readingListToMarkdown([]);
    expect(md).toContain('0 papers');
    expect(md).toContain('empty');
  });

  it('includes paper count in header', () => {
    const papers = [makePaper(), makePaper({ arxiv_id: '2401.00002', title: 'Paper 2' })];
    const md = readingListToMarkdown(papers);
    expect(md).toContain('2 papers');
  });

  it('uses singular "paper" for count=1', () => {
    const md = readingListToMarkdown([makePaper()]);
    expect(md).toMatch(/1 paper[^s]/);
  });

  it('groups by status when groupByStatus=true (default)', () => {
    const papers = [
      makePaper({ status: 'done',    arxiv_id: '2401.00001' }),
      makePaper({ status: 'reading', arxiv_id: '2401.00002', title: 'Currently reading' }),
      makePaper({ status: 'unread',  arxiv_id: '2401.00003', title: 'Unread paper' }),
    ];
    const md = readingListToMarkdown(papers);
    expect(md).toContain('## Currently Reading (1)');
    expect(md).toContain('## Unread (1)');
    expect(md).toContain('## Done (1)');
  });

  it('skips empty status sections', () => {
    const papers = [makePaper({ status: 'unread' })];
    const md = readingListToMarkdown(papers);
    expect(md).toContain('## Unread');
    expect(md).not.toContain('## Done');
    expect(md).not.toContain('## Currently Reading');
  });

  it('produces flat list when groupByStatus=false', () => {
    const papers = [
      makePaper({ status: 'done',    arxiv_id: '2401.00001' }),
      makePaper({ status: 'reading', arxiv_id: '2401.00002' }),
    ];
    const md = readingListToMarkdown(papers, { groupByStatus: false });
    expect(md).not.toContain('## Currently Reading');
    expect(md).not.toContain('## Done');
  });

  it('includes PaperBrief branding in header', () => {
    const md = readingListToMarkdown([makePaper()]);
    expect(md).toContain('PaperBrief');
  });

  it('sorts papers within a group by saved_at descending', () => {
    const papers = [
      makePaper({ arxiv_id: '2401.00001', saved_at: '2026-01-01T00:00:00Z' }),
      makePaper({ arxiv_id: '2401.00002', saved_at: '2026-03-01T00:00:00Z', title: 'Newer paper' }),
    ];
    const md = readingListToMarkdown(papers, { groupByStatus: false });
    const pos1 = md.indexOf('Newer paper');
    const pos2 = md.indexOf('Attention Is All You Need');
    expect(pos1).toBeLessThan(pos2);
  });
});
