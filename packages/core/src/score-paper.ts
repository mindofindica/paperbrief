/**
 * score-paper.ts
 *
 * Score arxiv papers for relevance to a research track using an LLM.
 * Returns a 0-5 score + reasoning.
 *
 * Uses OpenRouter for model access (supports Claude, GPT-4o, etc.).
 */

import type { ArxivPaper, ScoredPaper, Track } from './types.js';

export interface LLMConfig {
  apiKey: string;
  baseUrl?: string;       // defaults to OpenRouter
  scoringModel?: string;  // defaults to claude-haiku-4-5 (fast + cheap)
  summaryModel?: string;  // defaults to claude-haiku-4-5
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_SCORING_MODEL = 'anthropic/claude-haiku-4-5';
const DEFAULT_SUMMARY_MODEL = 'anthropic/claude-haiku-4-5';

const SCORE_SYSTEM_PROMPT = `You are a research relevance evaluator. You assess how relevant an academic paper is to a researcher's specific interests.

Scoring scale:
5 - Essential: Directly addresses the researcher's topics. Would be embarrassing to miss.
4 - Highly relevant: Strong overlap with researcher's work. Worth reading in full.
3 - Worth a look: Related area, some useful ideas. Skim-worthy.
2 - Tangentially related: Covers adjacent topics. Only read if time allows.
1 - Marginally relevant: Barely overlaps. Probably skip.
0 - Not relevant: Different domain, no meaningful overlap.

Be calibrated. Most papers score 0-2. Only 5-10% should score 4-5.
Respond only with valid JSON.`;

function scoringPrompt(track: Track, paper: ArxivPaper): string {
  return `Research track: "${track.name}"
Keywords: ${track.keywords.join(', ')}

Paper:
Title: ${paper.title}
Abstract: ${paper.abstract.slice(0, 1000)}

Score this paper's relevance. Respond with JSON:
{
  "score": <0-5>,
  "reason": "<1-2 sentences: why this score, specific to the track>"
}`;
}

function summaryPrompt(paper: ArxivPaper): string {
  return `Summarise this research paper in 2-3 plain English sentences. No jargon. Focus on: what they did, what they found, why it matters.

Title: ${paper.title}
Abstract: ${paper.abstract.slice(0, 1500)}

Respond with only the summary text (no quotes, no preamble).`;
}

async function callLLM(
  config: LLMConfig,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = config.baseUrl ?? OPENROUTER_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://paperbrief.io',
      'X-Title': 'PaperBrief',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error: HTTP ${res.status}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Score a single paper for a track.
 * Returns null if scoring fails.
 */
export async function scorePaper(
  config: LLMConfig,
  track: Track,
  paper: ArxivPaper,
): Promise<{ score: number; reason: string } | null> {
  try {
    const model = config.scoringModel ?? DEFAULT_SCORING_MODEL;
    const raw = await callLLM(config, model, SCORE_SYSTEM_PROMPT, scoringPrompt(track, paper));

    // Parse JSON response (may have markdown code fence)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as { score?: number; reason?: string };
    const score = Math.min(5, Math.max(0, Math.round(Number(parsed.score ?? 0))));
    const reason = String(parsed.reason ?? '').trim();
    return { score, reason };
  } catch (err) {
    console.error(`[scorePaper] Failed for ${paper.arxivId}:`, err);
    return null;
  }
}

/**
 * Generate a plain-English summary of a paper.
 */
export async function summarizePaper(
  config: LLMConfig,
  paper: ArxivPaper,
): Promise<string> {
  try {
    const model = config.summaryModel ?? DEFAULT_SUMMARY_MODEL;
    const summary = await callLLM(config, model, '', summaryPrompt(paper));
    return summary.trim();
  } catch {
    // Fallback to first 2 sentences of abstract
    const sentences = paper.abstract.split(/[.!?]\s+/).slice(0, 2).join('. ');
    return `${sentences}.`;
  }
}

/**
 * Score a batch of papers for a track.
 * Filters to papers meeting minScore threshold.
 * Rate-limited with configurable concurrency.
 */
export async function scorePapers(
  config: LLMConfig,
  track: Track,
  papers: ArxivPaper[],
  opts: { concurrency?: number; delayMs?: number } = {},
): Promise<ScoredPaper[]> {
  const { concurrency = 3, delayMs = 200 } = opts;
  const results: ScoredPaper[] = [];

  // Process in batches of `concurrency`
  for (let i = 0; i < papers.length; i += concurrency) {
    const batch = papers.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (paper) => {
        const scoreResult = await scorePaper(config, track, paper);
        if (!scoreResult || scoreResult.score < track.minScore) return null;

        const summary = await summarizePaper(config, paper);
        return {
          paper,
          trackId: track.id,
          trackName: track.name,
          score: scoreResult.score,
          reason: scoreResult.reason,
          summary,
        } satisfies ScoredPaper;
      }),
    );

    for (const r of batchResults) {
      if (r) results.push(r);
    }

    if (i + concurrency < papers.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}
