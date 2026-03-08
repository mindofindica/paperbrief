'use client';

import { useState } from 'react';

export interface PaperMeta {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  published_at: string | null;
}

export type ContentMap = Record<string, string>;

const TABS = [
  { key: 'card_summary',      label: 'Overview' },
  { key: 'tldr',              label: 'TL;DR' },
  { key: 'explain_eli12',     label: 'ELI12' },
  { key: 'explain_undergrad', label: 'Undergrad' },
  { key: 'explain_engineer',  label: 'Engineer' },
  { key: 'key_ideas',         label: 'Key Ideas' },
  { key: 'how_it_works',      label: 'How It Works' },
  { key: 'why_it_matters',    label: 'Why It Matters' },
] as const;

interface Props {
  paper: PaperMeta;
  content: ContentMap;
}

export default function PaperDetailClient({ paper, content }: Props) {
  const availableTabs = TABS.filter(t => content[t.key]);
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.key ?? 'tldr');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-500 mb-1">
          {paper.published_at ? new Date(paper.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date unknown'}
          {' · '}
          <a
            href={`https://arxiv.org/abs/${paper.arxiv_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            arxiv:{paper.arxiv_id}
          </a>
        </p>
        <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-2">{paper.title}</h1>
        <p className="text-sm text-gray-500">{paper.authors.slice(0, 5).join(', ')}{paper.authors.length > 5 ? ' et al.' : ''}</p>
      </div>

      {/* Tabs */}
      {availableTabs.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-gray-200 mb-6">
            {availableTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium rounded-t transition-colors ${
                  activeTab === tab.key
                    ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="prose prose-gray max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap">
            {content[activeTab]}
          </div>
        </>
      ) : (
        <div className="text-gray-500 italic">Content is being generated — check back shortly.</div>
      )}

      {/* Abstract (collapsible) */}
      {paper.abstract && (
        <details className="mt-8 border border-gray-200 rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
            Original abstract
          </summary>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">{paper.abstract}</p>
        </details>
      )}
    </div>
  );
}
