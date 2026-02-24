/**
 * format-digest.ts
 *
 * Assemble and format a digest from scored papers.
 * Outputs structured Digest objects for email/Telegram/Slack rendering.
 */

import type { Digest, DigestEntry, ScoredPaper } from './types.js';
import { formatAuthors, scoreLabel } from './types.js';

export interface DigestOptions {
  userId: string;
  weekOf: string;          // ISO date of Monday
  maxEntries?: number;     // default 20 total
  maxPerTrack?: number;    // default 5 per track
}

/**
 * Build a Digest from a set of scored papers (across all tracks).
 */
export function buildDigest(
  scoredPapers: ScoredPaper[],
  opts: DigestOptions,
): Digest {
  const {
    userId,
    weekOf,
    maxEntries = 20,
    maxPerTrack = 5,
  } = opts;

  // Group by track, sort within each track by score desc
  const byTrack = new Map<string, ScoredPaper[]>();
  for (const sp of scoredPapers) {
    const list = byTrack.get(sp.trackId) ?? [];
    list.push(sp);
    byTrack.set(sp.trackId, list);
  }
  for (const list of byTrack.values()) {
    list.sort((a, b) => b.score - a.score);
  }

  // Interleave tracks (round-robin) to avoid one track dominating
  const entries: DigestEntry[] = [];
  const iters = new Map<string, Iterator<ScoredPaper>>();
  for (const [tid, list] of byTrack.entries()) {
    iters.set(tid, list.slice(0, maxPerTrack)[Symbol.iterator]());
  }

  let added = 0;
  while (added < maxEntries) {
    let anyAdded = false;
    for (const [, iter] of iters) {
      if (added >= maxEntries) break;
      const { value, done } = iter.next();
      if (done || !value) continue;
      entries.push(toEntry(value));
      added++;
      anyAdded = true;
    }
    if (!anyAdded) break;
  }

  return {
    userId,
    weekOf,
    entries,
    tracksIncluded: [...byTrack.keys()],
    totalPapersScanned: scoredPapers.length,
    totalPapersIncluded: entries.length,
    generatedAt: new Date().toISOString(),
  };
}

function toEntry(sp: ScoredPaper): DigestEntry {
  return {
    arxivId: sp.paper.arxivId,
    title: sp.paper.title,
    authors: formatAuthors(sp.paper.authors),
    score: sp.score,
    scoreLabel: scoreLabel(sp.score),
    summary: sp.summary,
    reason: sp.reason,
    absUrl: sp.paper.absUrl,
    trackName: sp.trackName,
  };
}

// ─── Plain-text email rendering ──────────────────────────────────────────────

/**
 * Render a digest as a plain-text email body.
 */
export function renderDigestText(digest: Digest): string {
  const lines: string[] = [];

  lines.push(`PaperBrief — Week of ${digest.weekOf}`);
  lines.push(`${digest.totalPapersIncluded} papers selected from ${digest.totalPapersScanned} scanned`);
  lines.push('='.repeat(60));
  lines.push('');

  // Group entries by track for the output
  const byTrack = new Map<string, DigestEntry[]>();
  for (const e of digest.entries) {
    const list = byTrack.get(e.trackName) ?? [];
    list.push(e);
    byTrack.set(e.trackName, list);
  }

  for (const [trackName, entries] of byTrack.entries()) {
    lines.push(`[ ${trackName.toUpperCase()} ]`);
    lines.push('');

    for (const e of entries) {
      lines.push(`${e.scoreLabel}  ${e.title}`);
      lines.push(`${e.authors} · arxiv:${e.arxivId}`);
      lines.push(e.summary);
      lines.push(`→ ${e.absUrl}`);
      lines.push('');
    }

    lines.push('-'.repeat(60));
    lines.push('');
  }

  lines.push('Manage your tracks → https://paperbrief.io/dashboard');
  lines.push('Unsubscribe → https://paperbrief.io/unsubscribe');

  return lines.join('\n');
}

// ─── Markdown rendering (Telegram / Slack) ───────────────────────────────────

/**
 * Render a digest as Markdown (for Telegram/Slack delivery).
 */
export function renderDigestMarkdown(digest: Digest): string {
  const lines: string[] = [];

  lines.push(`**📄 PaperBrief — Week of ${digest.weekOf}**`);
  lines.push(`_${digest.totalPapersIncluded} papers from ${digest.totalPapersScanned} scanned_`);
  lines.push('');

  const byTrack = new Map<string, DigestEntry[]>();
  for (const e of digest.entries) {
    const list = byTrack.get(e.trackName) ?? [];
    list.push(e);
    byTrack.set(e.trackName, list);
  }

  for (const [trackName, entries] of byTrack.entries()) {
    lines.push(`**${trackName}**`);
    lines.push('');

    for (const e of entries) {
      lines.push(`${e.scoreLabel} **[${e.title}](${e.absUrl})**`);
      lines.push(`_${e.authors}_`);
      lines.push(e.summary);
      lines.push('');
    }
  }

  return lines.join('\n');
}
