/**
 * SampleDigest — "What your digest looks like" preview section
 *
 * Shows 3 hardcoded realistic paper cards on the landing page.
 * Gives visitors a concrete sense of what they'd receive before signing up.
 *
 * Visual language matches real digest emails: score badge, title, authors,
 * abstract excerpt, and feedback buttons.
 */
import React from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SamplePaper {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  score: number;
  category: string;
  submittedDate: string;
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_PAPERS: SamplePaper[] = [
  {
    arxivId: "2403.01234",
    title:
      "Mixture-of-Agents: Scaling LLM Reasoning with Collaborative Expert Routing",
    authors: ["Wang, J.", "Chen, L.", "Patel, A.", "Kim, S."],
    abstract:
      "We present Mixture-of-Agents (MoA), a framework that leverages multiple specialised LLM experts to collaboratively solve complex reasoning tasks. Rather than routing queries to a single model, MoA dynamically aggregates outputs from a panel of agents with complementary strengths. On MMLU, GSM8K, and HumanEval, MoA achieves 3–7% gains over the best single-agent baseline while reducing per-query cost by 40% through selective expert activation. We show that diversity among agents is the key predictor of ensemble gains, motivating new strategies for expert diversity regularisation during fine-tuning.",
    score: 94,
    category: "Multi-Agent Systems",
    submittedDate: "14 Mar 2026",
  },
  {
    arxivId: "2403.02891",
    title:
      "RAPTOR: Recursive Abstractive Processing for Tree-Organised Retrieval",
    authors: ["Sarthi, P.", "Abdullah, S.", "Tiwari, A."],
    abstract:
      "Retrieval-Augmented Generation (RAG) struggles when relevant information is spread across multiple document sections. RAPTOR addresses this by recursively clustering and summarising text chunks into a hierarchical tree, enabling retrieval at multiple levels of abstraction. On NarrativeQA, QASPER, and QuALITY benchmarks, RAPTOR improves answer F1 by 12–21% over flat chunk retrieval. The tree structure also supports interpretable retrieval paths, making it easier to audit which document sections contributed to each answer.",
    score: 87,
    category: "RAG & Grounding",
    submittedDate: "13 Mar 2026",
  },
  {
    arxivId: "2403.04172",
    title:
      "ToolChain*: Efficient Tree-Search for LLM Tool-Use Planning under Uncertainty",
    authors: ["Zhuang, Y.", "Yu, Y.", "Wang, K.", "Sun, H.", "Zhang, C."],
    abstract:
      "Planning with external tools requires LLMs to balance exploration and exploitation in a vast action space. ToolChain* adapts the A* search algorithm to tool-use planning, using a learned heuristic that estimates remaining task cost from partial tool-call sequences. Evaluated on HotpotQA, AlfWorld, and WebShop, ToolChain* solves 28% more tasks than chain-of-thought prompting and is 3× more token-efficient than Monte Carlo tree search. We release the benchmark suite and heuristic training code to support future work.",
    score: 81,
    category: "Planning & Agents",
    submittedDate: "12 Mar 2026",
  },
];

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : score >= 80
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : "bg-gray-100 text-gray-700 border-gray-200";

  const label =
    score >= 90 ? "🔥 Must-read" : score >= 80 ? "⭐ Recommended" : "📌 Relevant";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}
    >
      {label} · {score}
    </span>
  );
}

// ── Paper card ────────────────────────────────────────────────────────────────

function PaperCard({ paper }: { paper: SamplePaper }) {
  const maxAbstract = 260;
  const abstract =
    paper.abstract.length > maxAbstract
      ? paper.abstract.slice(0, maxAbstract).trimEnd() + "…"
      : paper.abstract;

  const authorsStr =
    paper.authors.length > 3
      ? `${paper.authors.slice(0, 3).join(", ")} +${paper.authors.length - 3} more`
      : paper.authors.join(", ");

  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <ScoreBadge score={paper.score} />
        <span className="text-xs text-gray-400 shrink-0">{paper.submittedDate}</span>
      </div>

      {/* Category pill */}
      <div className="mb-2">
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
          {paper.category}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-gray-900 leading-snug mb-2">
        {paper.title}
      </h3>

      {/* Authors */}
      <p className="text-xs text-gray-500 mb-3">{authorsStr}</p>

      {/* Abstract excerpt */}
      <p className="text-sm text-gray-600 leading-relaxed mb-5">{abstract}</p>

      {/* Action row */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <a
          href={`https://arxiv.org/abs/${paper.arxivId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          arXiv:{paper.arxivId} ↗
        </a>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">Was this relevant?</span>
          <button
            disabled
            title="Feedback in your real digest"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-500 cursor-default"
          >
            👍 Yes
          </button>
          <button
            disabled
            title="Feedback in your real digest"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-500 cursor-default"
          >
            👎 No
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function SampleDigest() {
  return (
    <section className="bg-white py-20 px-6 border-t border-gray-100">
      <div className="max-w-4xl mx-auto">
        {/* Section heading */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
            What you'll receive
          </p>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            A sample digest
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Every paper is scored 0–100 for relevance to your research track.
            You only see the papers worth your time — ranked, summarised, and
            ready to act on.
          </p>
        </div>

        {/* Digest header bar */}
        <div className="rounded-t-2xl bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">
              PaperBrief · Weekly Digest
            </p>
            <p className="text-sm font-medium">
              Multi-Agent Systems · March 14, 2026
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">3 papers this week</p>
            <p className="text-xs text-gray-400">from 547 scanned</p>
          </div>
        </div>

        {/* Paper cards */}
        <div className="space-y-4 bg-gray-50 rounded-b-2xl border border-t-0 border-gray-200 p-6">
          {SAMPLE_PAPERS.map((paper) => (
            <PaperCard key={paper.arxivId} paper={paper} />
          ))}
        </div>

        {/* Caption */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Sample data only · Your digest will reflect your actual research tracks
        </p>
      </div>
    </section>
  );
}
