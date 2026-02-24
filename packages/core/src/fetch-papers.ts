/**
 * fetch-papers.ts
 *
 * Fetch recent papers from arxiv API for a given set of categories.
 * Politely rate-limited with exponential backoff.
 *
 * Adapted from arxiv-coach (battle-tested, Feb 2026).
 */

import { XMLParser } from 'fast-xml-parser';
import type { ArxivPaper } from './types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

const DEFAULT_CATEGORIES = ['cs.LG', 'cs.CL', 'cs.AI', 'cs.NE', 'stat.ML'];
const MAX_RESULTS_PER_CAT = 100;
const MAX_BACKOFF_MS = 120_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 5;

function text(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function parseArxivId(idUrl: string): { arxivId: string; version: string } {
  const m = idUrl.match(/arxiv\.org\/abs\/(.+)$/);
  const tail = m?.[1] ?? idUrl;
  const mv = tail.match(/^(?<id>\d{4}\.\d{4,5})(?<v>v\d+)?$/);
  const arxivId = mv?.groups?.id ?? tail.replace(/v\d+$/, '');
  const version = mv?.groups?.v ?? 'v1';
  return { arxivId, version };
}

async function fetchAtom(category: string, maxResults = MAX_RESULTS_PER_CAT): Promise<string> {
  const url =
    `https://export.arxiv.org/api/query` +
    `?search_query=cat:${encodeURIComponent(category)}` +
    `&start=0&max_results=${maxResults}&sortBy=lastUpdatedDate&sortOrder=descending`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal,
        headers: { 'User-Agent': 'PaperBrief (+https://paperbrief.io)' },
      });
      if (res.status === 429) {
        const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`arXiv returned HTTP ${res.status} for ${category}`);
      return res.text();
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`fetchAtom: exhausted retries for ${category}`);
}

function parseAtom(xml: string): ArxivPaper[] {
  const parsed = parser.parse(xml);
  const feed = parsed?.feed;
  if (!feed) return [];

  const entries = asArray(feed.entry);
  const papers: ArxivPaper[] = [];

  for (const e of entries) {
    const rawId = text(e?.id ?? '');
    if (!rawId.includes('arxiv.org')) continue;

    const { arxivId, version } = parseArxivId(rawId);
    const title = text(e?.title ?? '').replace(/\s+/g, ' ').trim();
    const abstract = text(e?.summary ?? '').replace(/\s+/g, ' ').trim();

    const authorRaw = asArray(e?.author);
    const authors = authorRaw.map((a: Record<string, unknown>) => text(a?.name ?? '')).filter(Boolean);

    const links = asArray(e?.link ?? []) as Array<{ '@_href'?: string; '@_type'?: string; '@_title'?: string }>;
    const absLink = links.find((l) => l['@_title'] === 'abs')?.['@_href'] ?? null;
    const pdfLink = links.find((l) => l['@_type'] === 'application/pdf')?.['@_href'] ?? null;

    const cats = asArray(e?.category ?? []) as Array<{ '@_term'?: string }>;
    const categories = cats.map((c) => c['@_term'] ?? '').filter(Boolean);

    papers.push({
      arxivId,
      version,
      title,
      abstract,
      authors,
      categories,
      publishedAt: text(e?.published ?? ''),
      updatedAt: text(e?.updated ?? ''),
      absUrl: absLink ?? `https://arxiv.org/abs/${arxivId}`,
      pdfUrl: pdfLink,
    });
  }

  return papers;
}

/**
 * Fetch recent papers from arxiv for the given categories.
 * De-duplicates by arxiv ID (may appear in multiple categories).
 */
export async function fetchRecentPapers(
  categories: string[] = DEFAULT_CATEGORIES,
  maxPerCategory = MAX_RESULTS_PER_CAT,
): Promise<ArxivPaper[]> {
  const seen = new Set<string>();
  const results: ArxivPaper[] = [];

  for (const cat of categories) {
    try {
      const xml = await fetchAtom(cat, maxPerCategory);
      const papers = parseAtom(xml);
      for (const p of papers) {
        if (!seen.has(p.arxivId)) {
          seen.add(p.arxivId);
          results.push(p);
        }
      }
    } catch (err) {
      console.error(`[fetchRecentPapers] Failed for ${cat}:`, err);
    }
    // Polite delay between categories
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
  }

  return results;
}

/**
 * Filter papers by keyword match (pre-filter before LLM scoring).
 * Returns papers where title OR abstract contains at least one keyword.
 */
export function prefilterPapers(papers: ArxivPaper[], keywords: string[]): ArxivPaper[] {
  if (keywords.length === 0) return papers;
  const lowerKws = keywords.map((k) => k.toLowerCase());
  return papers.filter((p) => {
    const hay = `${p.title} ${p.abstract}`.toLowerCase();
    return lowerKws.some((kw) => hay.includes(kw));
  });
}
