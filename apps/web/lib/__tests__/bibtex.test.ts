/**
 * Tests for lib/bibtex.ts
 *
 * Covers:
 *  escapeBibtex():
 *   - passes through clean text unchanged
 *   - escapes each LaTeX special character
 *   - handles multiple special chars in one string
 *   - escapes backslash before other chars (no double-escape)
 *
 *  formatAuthors():
 *   - returns "Unknown Authors" for null
 *   - returns "Unknown Authors" for empty array
 *   - parses JSON array of names → "A and B and C"
 *   - handles comma-separated fallback (non-JSON string)
 *   - truncates at 20 authors with "others"
 *   - handles single author
 *   - handles non-array JSON (fallback to string)
 *
 *  makeCiteKey():
 *   - prefixes with "arxiv_"
 *   - replaces "." with "_"
 *   - replaces "/" with "_" (old-style arXiv IDs)
 *   - keeps alphanumerics, hyphens, underscores
 *
 *  extractDate():
 *   - returns nulls for null input
 *   - parses YYYY-MM-DD correctly
 *   - parses ISO timestamp prefix
 *   - returns null month for invalid month (13)
 *   - handles YYYY-01 through YYYY-12 month names
 *
 *  paperToBibtex():
 *   - produces @misc entry with correct cite key
 *   - includes all expected fields
 *   - omits null/empty fields
 *   - no trailing comma on last field
 *   - escapes special chars in title
 *   - includes annote when note is present
 *   - omits abstract when abstract is null
 *
 *  readingListToBibtex():
 *   - returns header + empty-comment for empty list
 *   - produces one entry per paper
 *   - sorts by saved_at descending
 *   - omits abstracts when includeAbstracts=false
 *   - separates entries with blank lines
 */

import { describe, it, expect } from 'vitest';
import {
  escapeBibtex,
  formatAuthors,
  makeCiteKey,
  extractDate,
  paperToBibtex,
  readingListToBibtex,
} from '../bibtex';
import type { ReadingListPaper } from '../reading-list-supa';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePaper(overrides: Partial<ReadingListPaper> = {}): ReadingListPaper {
  return {
    arxiv_id: '2401.00001',
    title: 'Attention Is All You Need',
    abstract: 'We propose a new simple network architecture, the Transformer.',
    authors: JSON.stringify(['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar']),
    track: 'cs.LG',
    llm_score: 9,
    published_at: '2017-06-12',
    status: 'unread',
    priority: 0,
    note: null,
    saved_at: '2026-03-14T00:00:00Z',
    ...overrides,
  };
}

// ── escapeBibtex ──────────────────────────────────────────────────────────────

describe('escapeBibtex', () => {
  it('passes through clean text unchanged', () => {
    expect(escapeBibtex('Hello world')).toBe('Hello world');
  });

  it('escapes ampersand', () => {
    expect(escapeBibtex('Tom & Jerry')).toBe('Tom {\\&} Jerry');
  });

  it('escapes percent', () => {
    expect(escapeBibtex('50% done')).toBe('50{\\%} done');
  });

  it('escapes dollar sign', () => {
    expect(escapeBibtex('$100')).toBe('{\\$}100');
  });

  it('escapes hash', () => {
    expect(escapeBibtex('item #1')).toBe('item {\\#}1');
  });

  it('escapes underscore', () => {
    expect(escapeBibtex('some_field')).toBe('some{\\_}field');
  });

  it('escapes caret', () => {
    expect(escapeBibtex('x^2')).toBe('x{\\^{}}2');
  });

  it('escapes tilde', () => {
    expect(escapeBibtex('a~b')).toBe('a{\\~{}}b');
  });

  it('escapes backslash without double-escaping subsequent characters', () => {
    // \& → backslash becomes {textbackslash}, then & becomes {\&}
    expect(escapeBibtex('\\&')).toBe('{\\textbackslash}{\\&}');
  });

  it('leaves curly braces unescaped (BibTeX grouping chars)', () => {
    // Braces are intentional in math content and LaTeX snippets
    expect(escapeBibtex('{test}')).toBe('{test}');
  });

  it('handles multiple special chars in one string', () => {
    const result = escapeBibtex('A & B: 50% of $10');
    expect(result).toContain('{\\&}');
    expect(result).toContain('{\\%}');
    expect(result).toContain('{\\$}');
  });
});

// ── formatAuthors ─────────────────────────────────────────────────────────────

describe('formatAuthors', () => {
  it('returns "Unknown Authors" for null', () => {
    expect(formatAuthors(null)).toBe('Unknown Authors');
  });

  it('returns "Unknown Authors" for empty JSON array', () => {
    expect(formatAuthors('[]')).toBe('Unknown Authors');
  });

  it('formats JSON array of names with "and" separator', () => {
    const result = formatAuthors(JSON.stringify(['Alice', 'Bob', 'Charlie']));
    expect(result).toBe('Alice and Bob and Charlie');
  });

  it('handles single author', () => {
    expect(formatAuthors(JSON.stringify(['Turing'])) ).toBe('Turing');
  });

  it('falls back to comma-separated when not JSON', () => {
    const result = formatAuthors('Alice, Bob, Charlie');
    expect(result).toBe('Alice and Bob and Charlie');
  });

  it('truncates at 20 authors with "others"', () => {
    const many = Array.from({ length: 25 }, (_, i) => `Author ${i + 1}`);
    const result = formatAuthors(JSON.stringify(many));
    const parts = result.split(' and ');
    expect(parts).toHaveLength(21);  // 20 real + "others"
    expect(parts[20]).toBe('others');
  });

  it('does not add "others" for exactly 20 authors', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `Author ${i + 1}`);
    const result = formatAuthors(JSON.stringify(twenty));
    expect(result).not.toContain('others');
    expect(result.split(' and ')).toHaveLength(20);
  });

  it('falls back gracefully when JSON is a non-array value', () => {
    // JSON.parse("42") → number, not array → fallback
    const result = formatAuthors('"single author"');
    // parsed is a string, not array — falls through to final return
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── makeCiteKey ───────────────────────────────────────────────────────────────

describe('makeCiteKey', () => {
  it('prefixes with arxiv_', () => {
    expect(makeCiteKey('2401.00001')).toMatch(/^arxiv_/);
  });

  it('replaces dots with underscores', () => {
    expect(makeCiteKey('2401.00001')).toBe('arxiv_2401_00001');
  });

  it('replaces slashes with underscores (old-style IDs)', () => {
    expect(makeCiteKey('cs/0301013')).toBe('arxiv_cs_0301013');
  });

  it('keeps hyphens and existing underscores', () => {
    expect(makeCiteKey('2401-00001')).toBe('arxiv_2401-00001');
  });

  it('strips other special characters', () => {
    const key = makeCiteKey('2401.00001 (v2)');
    expect(key).not.toContain(' ');
    expect(key).not.toContain('(');
  });
});

// ── extractDate ───────────────────────────────────────────────────────────────

describe('extractDate', () => {
  it('returns nulls for null input', () => {
    expect(extractDate(null)).toEqual({ year: null, month: null });
  });

  it('parses YYYY-MM-DD correctly', () => {
    expect(extractDate('2017-06-12')).toEqual({ year: '2017', month: 'jun' });
  });

  it('parses ISO timestamp (uses YYYY-MM prefix)', () => {
    expect(extractDate('2024-01-15T10:30:00Z')).toEqual({ year: '2024', month: 'jan' });
  });

  it('returns null month for unparseable date', () => {
    expect(extractDate('not-a-date')).toEqual({ year: null, month: null });
  });

  it('maps all 12 months correctly', () => {
    const expected = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    expected.forEach((mon, i) => {
      const mm = String(i + 1).padStart(2, '0');
      expect(extractDate(`2024-${mm}-01`)).toEqual({ year: '2024', month: mon });
    });
  });
});

// ── paperToBibtex ─────────────────────────────────────────────────────────────

describe('paperToBibtex', () => {
  it('produces an @misc entry', () => {
    const bib = paperToBibtex(makePaper());
    expect(bib).toMatch(/^@misc\{/);
  });

  it('uses the correct cite key', () => {
    const bib = paperToBibtex(makePaper({ arxiv_id: '2401.00001' }));
    expect(bib).toMatch(/@misc\{arxiv_2401_00001,/);
  });

  it('includes the title', () => {
    const bib = paperToBibtex(makePaper({ title: 'My Paper' }));
    expect(bib).toContain('title');
    expect(bib).toContain('My Paper');
  });

  it('includes year and month from published_at', () => {
    const bib = paperToBibtex(makePaper({ published_at: '2017-06-12' }));
    expect(bib).toContain('2017');
    expect(bib).toContain('jun');
  });

  it('includes arXiv note field', () => {
    const bib = paperToBibtex(makePaper());
    expect(bib).toContain('arXiv preprint arXiv:2401.00001');
  });

  it('includes the URL', () => {
    const bib = paperToBibtex(makePaper());
    expect(bib).toContain('https://arxiv.org/abs/2401.00001');
  });

  it('includes formatted authors', () => {
    const paper = makePaper({ authors: JSON.stringify(['Alice', 'Bob']) });
    const bib = paperToBibtex(paper);
    expect(bib).toContain('Alice and Bob');
  });

  it('includes abstract when present', () => {
    const bib = paperToBibtex(makePaper({ abstract: 'A short summary.' }));
    expect(bib).toContain('A short summary.');
  });

  it('omits abstract when null', () => {
    const bib = paperToBibtex(makePaper({ abstract: null }));
    expect(bib).not.toContain('abstract');
  });

  it('includes keywords from track', () => {
    const bib = paperToBibtex(makePaper({ track: 'cs.LG' }));
    expect(bib).toContain('keywords');
    expect(bib).toContain('cs.LG');
  });

  it('omits keywords when track is null', () => {
    const bib = paperToBibtex(makePaper({ track: null }));
    expect(bib).not.toContain('keywords');
  });

  it('includes annote when note is present', () => {
    const bib = paperToBibtex(makePaper({ note: 'Must read for thesis.' }));
    expect(bib).toContain('annote');
    expect(bib).toContain('Must read for thesis.');
  });

  it('omits annote when note is null', () => {
    const bib = paperToBibtex(makePaper({ note: null }));
    expect(bib).not.toContain('annote');
  });

  it('has no trailing comma on the last field', () => {
    const bib = paperToBibtex(makePaper());
    // The closing } must be preceded by a line that doesn't end with ","
    const lines = bib.split('\n');
    const closingBrace = lines.findIndex((l) => l.trim() === '}');
    expect(closingBrace).toBeGreaterThan(0);
    const lastField = lines[closingBrace - 1];
    expect(lastField.trimEnd()).not.toMatch(/,$/);
  });

  it('closes the entry with a single "}"', () => {
    const bib = paperToBibtex(makePaper());
    expect(bib.trimEnd()).toMatch(/\}$/);
  });

  it('escapes special characters in title', () => {
    const bib = paperToBibtex(makePaper({ title: 'Fast & Furious: 50% Speedup' }));
    expect(bib).toContain('{\\&}');
    expect(bib).toContain('{\\%}');
  });

  it('escapes special characters in abstract', () => {
    const bib = paperToBibtex(makePaper({ abstract: 'Speed up by 50% with $O(n)$ complexity' }));
    expect(bib).toContain('{\\%}');
    expect(bib).toContain('{\\$}');
  });
});

// ── readingListToBibtex ───────────────────────────────────────────────────────

describe('readingListToBibtex', () => {
  it('returns header + empty-comment for empty list', () => {
    const result = readingListToBibtex([]);
    expect(result).toContain('% Generated by PaperBrief');
    expect(result).toContain('% (no papers in reading list)');
    expect(result).not.toContain('@misc');
  });

  it('includes the PaperBrief header', () => {
    const result = readingListToBibtex([makePaper()]);
    expect(result).toContain('% Generated by PaperBrief');
    expect(result).toContain('paperbrief.net');
  });

  it('produces one entry per paper', () => {
    const papers = [
      makePaper({ arxiv_id: '2401.00001', saved_at: '2026-03-14T00:00:00Z' }),
      makePaper({ arxiv_id: '2401.00002', saved_at: '2026-03-13T00:00:00Z' }),
    ];
    const result = readingListToBibtex(papers);
    expect((result.match(/@misc\{/g) ?? []).length).toBe(2);
  });

  it('sorts by saved_at descending (most recent first)', () => {
    const papers = [
      makePaper({ arxiv_id: '2401.00001', saved_at: '2026-03-12T00:00:00Z' }),  // older
      makePaper({ arxiv_id: '2401.00002', saved_at: '2026-03-14T00:00:00Z' }),  // newer
    ];
    const result = readingListToBibtex(papers);
    const idx1 = result.indexOf('arxiv_2401_00001');
    const idx2 = result.indexOf('arxiv_2401_00002');
    // newer paper (00002) should appear before older (00001)
    expect(idx2).toBeLessThan(idx1);
  });

  it('omits abstract fields when includeAbstracts=false', () => {
    const result = readingListToBibtex([makePaper()], { includeAbstracts: false });
    expect(result).not.toContain('abstract');
  });

  it('includes abstract fields by default', () => {
    const result = readingListToBibtex([makePaper()]);
    expect(result).toContain('abstract');
  });

  it('separates entries with blank lines', () => {
    const papers = [
      makePaper({ arxiv_id: '2401.00001', saved_at: '2026-03-14T00:00:00Z' }),
      makePaper({ arxiv_id: '2401.00002', saved_at: '2026-03-13T00:00:00Z' }),
    ];
    const result = readingListToBibtex(papers);
    // Entries are separated by "\n\n"
    expect(result).toContain('}\n\n@misc');
  });

  it('does not mutate the input array', () => {
    const papers = [
      makePaper({ arxiv_id: '2401.00001', saved_at: '2026-03-12T00:00:00Z' }),
      makePaper({ arxiv_id: '2401.00002', saved_at: '2026-03-14T00:00:00Z' }),
    ];
    const originalOrder = papers.map((p) => p.arxiv_id);
    readingListToBibtex(papers);
    expect(papers.map((p) => p.arxiv_id)).toEqual(originalOrder);
  });

  it('ends the file with a newline', () => {
    const result = readingListToBibtex([makePaper()]);
    expect(result).toMatch(/\n$/);
  });
});
