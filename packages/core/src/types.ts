// Core types for PaperBrief

export interface ArxivPaper {
  arxivId: string;         // e.g. "2502.12345"
  version: string;         // e.g. "v1"
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];    // e.g. ["cs.LG", "cs.CL"]
  publishedAt: string;     // ISO date
  updatedAt: string;       // ISO date
  absUrl: string;          // https://arxiv.org/abs/...
  pdfUrl: string | null;   // https://arxiv.org/pdf/...
}

export interface Track {
  id: string;
  name: string;            // e.g. "Speculative Decoding"
  keywords: string[];      // e.g. ["speculative decoding", "draft model", "token speculation"]
  arxivCats: string[];     // e.g. ["cs.LG", "cs.CL"] — empty = all ML categories
  minScore: number;        // 0-5, papers below this are excluded from digest
}

export interface ScoredPaper {
  paper: ArxivPaper;
  trackId: string;
  trackName: string;
  score: number;           // 0-5 LLM relevance score
  reason: string;          // LLM's explanation of why this paper is relevant
  summary: string;         // 2-3 sentence plain-English summary
}

export interface DigestEntry {
  arxivId: string;
  title: string;
  authors: string;         // "Smith et al." or "Smith, Jones, Lee"
  score: number;
  scoreLabel: string;      // "🔥 Essential" | "⭐ Relevant" | "📌 Worth a look" | "· Marginal"
  summary: string;
  reason: string;
  absUrl: string;
  trackName: string;
}

export interface Digest {
  userId: string;
  weekOf: string;          // ISO date of Monday
  entries: DigestEntry[];
  tracksIncluded: string[];
  totalPapersScanned: number;
  totalPapersIncluded: number;
  generatedAt: string;     // ISO datetime
}

// Score threshold → label mapping
export function scoreLabel(score: number): string {
  if (score >= 5) return '🔥 Essential';
  if (score >= 4) return '⭐ Relevant';
  if (score >= 3) return '📌 Worth a look';
  return '· Marginal';
}

// Format authors for display
export function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0];
  if (authors.length <= 3) return authors.join(', ');
  return `${authors[0]} et al.`;
}
