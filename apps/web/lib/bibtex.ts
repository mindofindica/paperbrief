/**
 * bibtex.ts
 *
 * Converts ReadingListPaper entries to BibTeX format.
 *
 * Each arXiv paper becomes an @misc entry — the standard entry type
 * for preprints. Keys and field values are sanitised for valid BibTeX output.
 *
 * Usage:
 *   import { readingListToBibtex } from './bibtex';
 *   const bibContent = readingListToBibtex(papers);
 *   // → full .bib file string
 */

import type { ReadingListPaper } from './reading-list-supa';

// ── BibTeX special-character escaping ─────────────────────────────────────────

/**
 * Escape LaTeX special characters inside a BibTeX field value.
 * The value will be wrapped in outer `{…}` by the caller.
 *
 * Characters handled: \ & % $ # _ ^ ~
 *
 * Note: `{` and `}` are BibTeX grouping characters and are left as-is —
 * they appear in arXiv math content and LaTeX snippets where they're intentional.
 * Unbalanced braces in paper titles/abstracts are exceedingly rare.
 *
 * Tilde (~) and caret (^) need a trailing `{}` to avoid consuming the next char.
 * Backslash is replaced first so our escape sequences aren't double-processed.
 */
export function escapeBibtex(text: string): string {
  return text
    .replace(/\\/g, '{\\textbackslash}')  // \ first — introduce no new backslashes after this
    .replace(/&/g, '{\\&}')
    .replace(/%/g, '{\\%}')
    .replace(/\$/g, '{\\$}')
    .replace(/#/g, '{\\#}')
    .replace(/_/g, '{\\_}')
    .replace(/\^/g, '{\\^{}}')
    .replace(/~/g, '{\\~{}}');
}

// ── Author formatting ─────────────────────────────────────────────────────────

/**
 * Parse the authors field (JSON string or plain string) and format as
 * BibTeX author string: "Author One and Author Two and Author Three".
 *
 * Returns "Unknown Authors" when authors field is absent.
 * Truncates at 20 authors with "others" (standard BibTeX convention).
 */
export function formatAuthors(authorsJson: string | null): string {
  if (!authorsJson) return 'Unknown Authors';

  let names: string[];
  try {
    const parsed = JSON.parse(authorsJson);
    names = Array.isArray(parsed) ? parsed.map(String) : [authorsJson];
  } catch {
    // Not JSON — assume plain string, possibly comma-separated
    names = authorsJson.split(',').map((n) => n.trim()).filter(Boolean);
  }

  if (names.length === 0) return 'Unknown Authors';

  const MAX_AUTHORS = 20;
  if (names.length > MAX_AUTHORS) {
    return [...names.slice(0, MAX_AUTHORS), 'others'].join(' and ');
  }
  return names.join(' and ');
}

// ── Cite-key generation ───────────────────────────────────────────────────────

/**
 * Generate a BibTeX cite key from an arXiv ID.
 *
 * arXiv IDs (e.g. "2401.00001", "cs/0301013") are valid as-is in most
 * TeX distributions, but the slash in old-style IDs is illegal. We
 * replace "/" and "." with underscores and prefix with "arxiv_" so the
 * key is unambiguous and safe across all engines.
 *
 * Example: "2401.00001"  → "arxiv_2401_00001"
 *          "cs/0301013"  → "arxiv_cs_0301013"
 */
export function makeCiteKey(arxivId: string): string {
  const sanitised = arxivId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `arxiv_${sanitised}`;
}

// ── Year / month extraction ───────────────────────────────────────────────────

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * Extract year and month strings from a published_at date string.
 * published_at is typically "YYYY-MM-DD" or an ISO timestamp.
 * Returns null values when date is absent or unparseable.
 */
export function extractDate(publishedAt: string | null): { year: string | null; month: string | null } {
  if (!publishedAt) return { year: null, month: null };

  const match = publishedAt.match(/^(\d{4})-(\d{2})/);
  if (!match) return { year: null, month: null };

  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1; // 0-indexed
  const month = monthIdx >= 0 && monthIdx < 12 ? MONTH_NAMES[monthIdx] : null;

  return { year, month };
}

// ── Single-entry formatter ────────────────────────────────────────────────────

/**
 * Convert one ReadingListPaper to a BibTeX @misc entry string.
 *
 * Fields included:
 *   author, title, year, month, note (arXiv preprint), url, abstract,
 *   and optionally keywords (from track) and annote (reading list note).
 */
export function paperToBibtex(paper: ReadingListPaper): string {
  const citeKey = makeCiteKey(paper.arxiv_id);
  const { year, month } = extractDate(paper.published_at);

  // Ordered list of BibTeX fields — null/empty values are omitted automatically.
  const fields: Array<[string, string | null | undefined]> = [
    ['author',   formatAuthors(paper.authors)],
    ['title',    paper.title],
    ['year',     year],
    ['month',    month],
    ['note',     `arXiv preprint arXiv:${paper.arxiv_id}`],
    ['url',      `https://arxiv.org/abs/${paper.arxiv_id}`],
    ['abstract', paper.abstract],
    ['keywords', paper.track],
    ['annote',   paper.note],  // personal reading-list note, if any
  ];

  const lines: string[] = [`@misc{${citeKey},`];

  for (const [key, value] of fields) {
    if (value === null || value === undefined || value === '') continue;
    const escaped = escapeBibtex(value);
    lines.push(`  ${key.padEnd(10)} = {${escaped}},`);
  }

  // Remove trailing comma from last field (BibTeX is finicky)
  const lastIdx = lines.length - 1;
  lines[lastIdx] = lines[lastIdx].replace(/,$/, '');

  lines.push('}');

  return lines.join('\n');
}

// ── Full .bib file generator ──────────────────────────────────────────────────

const BIB_HEADER = `% Generated by PaperBrief — https://paperbrief.net
% Your personal reading list as BibTeX
% Import into Zotero, Mendeley, Overleaf, or any reference manager
%
`;

/**
 * Convert an array of ReadingListPaper entries to a complete .bib file string.
 *
 * Papers are sorted by saved_at descending (most recent first) so cite keys
 * are stable and the file reads naturally as a personal library.
 *
 * Returns an empty file (header only) when the list is empty.
 */
export function readingListToBibtex(
  papers: ReadingListPaper[],
  options?: { includeAbstracts?: boolean },
): string {
  const includeAbstracts = options?.includeAbstracts ?? true;

  const sorted = [...papers].sort(
    (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime(),
  );

  if (sorted.length === 0) {
    return BIB_HEADER + '% (no papers in reading list)\n';
  }

  const entries = sorted.map((p) => {
    const paper = includeAbstracts ? p : { ...p, abstract: null };
    return paperToBibtex(paper);
  });

  return BIB_HEADER + entries.join('\n\n') + '\n';
}
