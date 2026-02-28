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

// ─── HTML email rendering (server-side, no React dep) ────────────────────────

/**
 * Render a digest as a self-contained HTML string.
 *
 * This is an escape-hatch for environments where React Email / JSX is not
 * available (e.g. plain Node.js scripts, tests). The DigestEmail React
 * component in apps/web is the canonical rendering path for Resend; this
 * function is useful for previewing and integration testing without a
 * Next.js bundler.
 */
export function renderDigestHtml(digest: Digest): string {
  function esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scoreDots(score: number): string {
    const filled = Math.round(score);
    return '●'.repeat(filled) + '○'.repeat(5 - filled);
  }

  function badgeStyle(score: number): string {
    if (score >= 5) return 'background:#fef3c7;color:#b45309';
    if (score >= 4) return 'background:#dbeafe;color:#1d4ed8';
    if (score >= 3) return 'background:#d1fae5;color:#065f46';
    return 'background:#f3f4f6;color:#6b7280';
  }

  // Group entries by track
  const byTrack = new Map<string, DigestEntry[]>();
  for (const e of digest.entries) {
    const list = byTrack.get(e.trackName) ?? [];
    list.push(e);
    byTrack.set(e.trackName, list);
  }

  const trackSections: string[] = [];
  for (const [trackName, entries] of byTrack.entries()) {
    const cards = entries.map((e) => {
      const excerpt = e.summary.length > 200 ? e.summary.slice(0, 197) + '…' : e.summary;
      const reason = e.reason
        ? `<p style="font-size:12px;color:#4b5563;font-style:italic;border-left:3px solid #d1d5db;padding-left:8px;margin:0 0 10px">${esc(e.reason)}</p>`
        : '';
      return `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 12px">
          <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:9999px;${badgeStyle(e.score)}">${esc(e.scoreLabel)} ${scoreDots(e.score)}</span>
          <p style="font-size:15px;font-weight:700;color:#111827;margin:8px 0 4px;line-height:1.4">${esc(e.title)}</p>
          <p style="font-size:12px;color:#6b7280;margin:0 0 8px;font-style:italic">${esc(e.authors)} · arxiv:${esc(e.arxivId)}</p>
          <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 6px">${esc(excerpt)}</p>
          ${reason}
          <a href="${esc(e.absUrl)}" style="background:#1a1a2e;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;border-radius:6px;text-decoration:none;display:inline-block">Read on arXiv →</a>
        </div>`;
    }).join('\n');

    trackSections.push(`
      <div style="margin:0 0 24px">
        <h2 style="font-size:18px;font-weight:700;color:#374151;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.05em">${esc(trackName)}</h2>
        ${cards}
      </div>`);
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>PaperBrief — Week of ${esc(digest.weekOf)}</title></head>
<body style="background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;margin:0;padding:24px">
  <div style="background:#fff;max-width:600px;margin:0 auto;padding:24px;border-radius:8px">
    <div style="text-align:center;padding:16px 0 8px">
      <p style="font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 8px">📄 PaperBrief</p>
      <h1 style="font-size:28px;font-weight:700;color:#1a1a2e;margin:8px 0 4px">Your weekly digest</h1>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px">Week of ${esc(digest.weekOf)} · ${digest.totalPapersIncluded} paper${digest.totalPapersIncluded !== 1 ? 's' : ''} from ${digest.totalPapersScanned} scanned across ${byTrack.size} track${byTrack.size !== 1 ? 's' : ''}</p>
    </div>
    <hr style="border-color:#e5e7eb;margin:16px 0">
    ${trackSections.join('\n')}
    <hr style="border-color:#e5e7eb;margin:16px 0">
    <div style="text-align:center;padding:8px 0">
      <a href="https://paperbrief.io/dashboard" style="background:#1a1a2e;color:#fff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block">Manage your tracks →</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:16px 0 0">
      You're receiving this because you have active PaperBrief tracks. <a href="https://paperbrief.io/unsubscribe" style="color:#9ca3af;text-decoration:underline">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}
