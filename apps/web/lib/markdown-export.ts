/**
 * markdown-export.ts
 *
 * Converts ReadingListPaper entries to a Markdown document.
 *
 * The output is a well-structured, human-readable `.md` file intended
 * for import into Obsidian, Notion, Bear, or any Markdown-based notes app.
 *
 * Structure:
 *   # My PaperBrief Reading List
 *   Generated: <date>  |  X papers
 *
 *   ## Reading (N)
 *   ### Paper Title
 *   ...fields...
 *
 *   ## Unread (N)
 *   ...
 *
 *   ## Done (N)
 *   ...
 */

import type { ReadingListPaper } from './reading-list-supa';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarkdownExportOptions {
  /** Include abstract text (default: true) */
  includeAbstracts?: boolean;
  /** Include personal notes (default: true) */
  includeNotes?: boolean;
  /** Group papers by status: reading → unread → done (default: true) */
  groupByStatus?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse authors JSON string → comma-separated display string */
export function formatAuthorsMd(authorsJson: string | null): string {
  if (!authorsJson) return 'Unknown Authors';
  try {
    const parsed = JSON.parse(authorsJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return 'Unknown Authors';
    const MAX = 5;
    if (parsed.length > MAX) {
      return [...parsed.slice(0, MAX).map(String), `+${parsed.length - MAX} more`].join(', ');
    }
    return parsed.map(String).join(', ');
  } catch {
    return authorsJson;
  }
}

/** Format a published_at date string as "Jan 2026" */
export function formatPublishedAt(publishedAt: string | null): string {
  if (!publishedAt) return 'Unknown date';
  const match = publishedAt.match(/^(\d{4})-(\d{2})/);
  if (!match) return publishedAt;
  const [, year, month] = match;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthName = months[parseInt(month, 10) - 1] ?? month;
  return `${monthName} ${year}`;
}

/** Escape Markdown special chars in a single-line value */
export function escapeMd(text: string): string {
  // Escape characters that would break inline Markdown formatting
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}

/** Render one paper as a Markdown section */
export function paperToMarkdown(
  paper: ReadingListPaper,
  opts: MarkdownExportOptions = {},
): string {
  const includeAbstracts = opts.includeAbstracts ?? true;
  const includeNotes = opts.includeNotes ?? true;

  const lines: string[] = [];

  lines.push(`### ${escapeMd(paper.title)}`);
  lines.push('');

  // Metadata table
  lines.push(`**Authors:** ${formatAuthorsMd(paper.authors)}`);
  lines.push(`**Published:** ${formatPublishedAt(paper.published_at)}`);
  lines.push(`**arXiv:** [${paper.arxiv_id}](https://arxiv.org/abs/${paper.arxiv_id})`);

  if (paper.track) {
    lines.push(`**Track:** ${escapeMd(paper.track)}`);
  }
  if (paper.llm_score !== null) {
    lines.push(`**Score:** ${paper.llm_score}/10`);
  }

  const statusEmoji: Record<string, string> = {
    unread: '📬',
    reading: '📖',
    done: '✅',
  };
  lines.push(`**Status:** ${statusEmoji[paper.status] ?? ''} ${paper.status}`);

  if (paper.priority !== 0) {
    lines.push(`**Priority:** ${paper.priority}`);
  }

  lines.push(`**Saved:** ${new Date(paper.saved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);

  // Abstract
  if (includeAbstracts && paper.abstract) {
    lines.push('');
    lines.push('> ' + paper.abstract.replace(/\n/g, '\n> ').trim());
  }

  // Personal note
  if (includeNotes && paper.note) {
    lines.push('');
    lines.push('**My note:**');
    lines.push(paper.note.trim());
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// ── Status labels ─────────────────────────────────────────────────────────────

const STATUS_ORDER: Array<'reading' | 'unread' | 'done'> = ['reading', 'unread', 'done'];

const STATUS_LABELS: Record<string, string> = {
  reading: 'Currently Reading',
  unread: 'Unread',
  done: 'Done',
};

// ── Main export function ──────────────────────────────────────────────────────

const MD_HEADER = (count: number, date: string) =>
  `# My PaperBrief Reading List\n\n` +
  `_Generated: ${date} · ${count} paper${count !== 1 ? 's' : ''}_\n\n` +
  `> Export from [PaperBrief](https://paperbrief.ai) — your personal AI research digest.\n\n`;

/**
 * Convert an array of ReadingListPaper entries to a Markdown document.
 *
 * When groupByStatus is true (default), papers are arranged into sections:
 * "Currently Reading", "Unread", "Done" — each with a count header.
 *
 * When false, papers appear in saved_at order (newest first).
 */
export function readingListToMarkdown(
  papers: ReadingListPaper[],
  options: MarkdownExportOptions = {},
): string {
  const groupByStatus = options.groupByStatus ?? true;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  if (papers.length === 0) {
    return MD_HEADER(0, date) + '_Your reading list is empty._\n';
  }

  const sorted = [...papers].sort(
    (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime(),
  );

  const header = MD_HEADER(papers.length, date);

  if (!groupByStatus) {
    return header + sorted.map(p => paperToMarkdown(p, options)).join('');
  }

  // Group by status
  const groups: Record<string, ReadingListPaper[]> = { reading: [], unread: [], done: [] };
  for (const paper of sorted) {
    const bucket = paper.status in groups ? paper.status : 'unread';
    groups[bucket].push(paper);
  }

  const sections: string[] = [header];

  for (const status of STATUS_ORDER) {
    const group = groups[status];
    if (group.length === 0) continue;

    sections.push(`## ${STATUS_LABELS[status]} (${group.length})\n\n`);
    sections.push(...group.map(p => paperToMarkdown(p, options)));
  }

  return sections.join('');
}
