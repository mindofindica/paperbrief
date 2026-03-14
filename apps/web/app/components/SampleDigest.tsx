/**
 * SampleDigest.tsx — Landing page section showing a realistic digest preview
 *
 * Static component (no data fetching) — shows what a weekly digest email looks like.
 * Uses realistic-looking papers from the kind of content ML researchers care about.
 */

import React from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SamplePaper {
  title: string;
  authors: string;
  score: number;
  excerpt: string;
  reason: string;
  track: string;
  arxivId: string;
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_PAPERS: SamplePaper[] = [
  {
    title: "Scaling Speculative Decoding with Draft Model Distillation",
    authors: "Chen, Y., Li, J., Zhang, W., et al.",
    score: 5,
    excerpt:
      "We introduce SpecDistill, a framework for training compact draft models via knowledge distillation from target LLMs. SpecDistill achieves 3.1× speed-up on LLaMA-3 70B with a 400M-parameter draft model, outperforming prior work by 40% while maintaining output distribution fidelity.",
    reason: "Directly extends your speculative decoding track — new SOTA on LLaMA-3 with public code.",
    track: "Inference Efficiency",
    arxivId: "2502.04891",
  },
  {
    title: "LoRA-Pro: Gradient-Aligned Low-Rank Adaptation for Large Language Models",
    authors: "Park, S., Kim, H., Wang, X.",
    score: 4,
    excerpt:
      "LoRA-Pro introduces a gradient alignment term that minimises the angular deviation between LoRA updates and full fine-tuning gradients. On instruction-following benchmarks, LoRA-Pro matches full fine-tuning performance at rank-8 while requiring only 0.3% of trainable parameters.",
    reason: "Improves LoRA quality directly — gradient alignment is a clean insight, likely to be widely adopted.",
    track: "Fine-tuning Methods",
    arxivId: "2502.07612",
  },
  {
    title: "Retrieval-Augmented Chain-of-Thought: Interleaving External Knowledge with Reasoning Steps",
    authors: "Nguyen, A., Patel, R., Smith, B., Tanaka, M.",
    score: 4,
    excerpt:
      "RA-CoT retrieves evidence mid-reasoning rather than upfront, inserting retrieved passages between chain-of-thought steps. This dynamic retrieval strategy reduces hallucination by 28% on knowledge-intensive tasks while adding only 12% latency overhead over standard RAG.",
    reason: "Relevant to your RAG track — interleaved retrieval is a novel direction with strong empirical gains.",
    track: "RAG & Grounding",
    arxivId: "2502.11023",
  },
];

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const configs = {
    5: { label: "🔥 Essential", bg: "bg-amber-100", text: "text-amber-800" },
    4: { label: "⭐ Relevant", bg: "bg-blue-100", text: "text-blue-800" },
    3: { label: "📌 Worth a look", bg: "bg-green-100", text: "text-green-800" },
  } as const;

  const config = configs[score as keyof typeof configs] ?? {
    label: "· Marginal",
    bg: "bg-gray-100",
    text: "text-gray-600",
  };

  const dots = "●".repeat(score) + "○".repeat(5 - score);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      {config.label}
      <span className="font-mono tracking-tighter opacity-70">{dots}</span>
    </span>
  );
}

// ── Track pill ────────────────────────────────────────────────────────────────

function TrackPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      {name}
    </span>
  );
}

// ── Paper card ────────────────────────────────────────────────────────────────

function PaperCard({ paper }: { paper: SamplePaper }) {
  return (
    <article className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-3">
      {/* Score + track */}
      <div className="flex items-center gap-2 flex-wrap">
        <ScoreBadge score={paper.score} />
        <TrackPill name={paper.track} />
      </div>

      {/* Title */}
      <h3 className="font-semibold text-gray-900 leading-snug text-base">
        {paper.title}
      </h3>

      {/* Authors */}
      <p className="text-xs text-gray-400">{paper.authors}</p>

      {/* Abstract excerpt */}
      <p className="text-sm text-gray-600 leading-relaxed">{paper.excerpt}</p>

      {/* Why it matters */}
      <p className="text-xs text-blue-600 italic border-l-2 border-blue-200 pl-3">
        Why this matters: {paper.reason}
      </p>

      {/* Footer: arXiv link + feedback */}
      <div className="flex items-center justify-between pt-1">
        <a
          href={`https://arxiv.org/abs/${paper.arxivId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-gray-700 hover:text-gray-900 underline underline-offset-2"
        >
          Read on arXiv →
        </a>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">Rate it:</span>
          <button
            aria-label="Helpful"
            className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors text-sm"
          >
            👍
          </button>
          <button
            aria-label="Not helpful"
            className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors text-sm"
          >
            👎
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function SampleDigest() {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-2">
            Sample digest
          </p>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            This is what lands in your inbox.
          </h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            Each paper is scored 1–5 for relevance to your specific research tracks.
            No noise — just the papers that actually matter to you.
          </p>
        </div>

        {/* Email chrome mock */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">
          {/* Email header mock */}
          <div className="bg-gray-100 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">📄 PaperBrief</span>
              <span className="text-gray-400">·</span>
              <span>Your weekly digest — 8 new papers across 3 tracks</span>
            </div>
          </div>

          {/* Email body */}
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900">
                Weekly Digest · Mar 14, 2026
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Top 3 of 8 papers · Tracks: Inference Efficiency, Fine-tuning Methods, RAG & Grounding
              </p>
            </div>

            <div className="space-y-4">
              {SAMPLE_PAPERS.map((paper) => (
                <PaperCard key={paper.arxivId} paper={paper} />
              ))}
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                + 5 more papers in your{" "}
                <span className="text-blue-500 cursor-pointer">full digest →</span>
              </p>
              <p className="text-xs text-gray-300 mt-2">
                PaperBrief · hello@paperbrief.ai ·{" "}
                <span className="cursor-pointer hover:underline">Unsubscribe</span>
              </p>
            </div>
          </div>
        </div>

        {/* Caption */}
        <p className="text-center text-sm text-gray-400 mt-4">
          Simulated digest — real PaperBrief emails contain papers matched to your exact research tracks.
        </p>
      </div>
    </section>
  );
}
