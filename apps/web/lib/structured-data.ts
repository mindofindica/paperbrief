/**
 * Schema.org JSON-LD generators for PaperBrief.
 * Used in Next.js pages via <script type="application/ld+json">.
 */

/** ScholarlyArticle for arXiv papers */
export function paperToJsonLd(paper: {
  title: string;
  authors: string[];
  abstract: string;
  publishedDate?: string; // YYYY-MM-DD
  arxivId: string;
  llmScore?: number;
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: paper.title,
    abstract: paper.abstract?.slice(0, 500),
    author: paper.authors.map((name) => ({
      '@type': 'Person',
      name,
    })),
    datePublished: paper.publishedDate,
    url: `https://arxiv.org/abs/${paper.arxivId}`,
    sameAs: `https://arxiv.org/abs/${paper.arxivId}`,
    publisher: {
      '@type': 'Organization',
      name: 'arXiv',
      url: 'https://arxiv.org',
    },
  };
}

/** BreadcrumbList for paper detail pages */
export function paperBreadcrumbJsonLd(paper: {
  title: string;
  arxivId: string;
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'PaperBrief',
        item: 'https://paperbrief.ai',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Papers',
        item: 'https://paperbrief.ai/papers',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: paper.title,
        item: `https://paperbrief.ai/papers/${paper.arxivId}`,
      },
    ],
  };
}

/** WebPage for the /today page */
export function todayPageJsonLd(paper?: {
  title: string;
  arxivId: string;
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: "Today's Top ML Paper",
    description:
      'Daily curated top machine learning paper from arXiv, scored and summarised by PaperBrief.',
    url: 'https://paperbrief.ai/today',
    ...(paper
      ? {
          about: {
            '@type': 'ScholarlyArticle',
            name: paper.title,
            url: `https://arxiv.org/abs/${paper.arxivId}`,
          },
        }
      : {}),
  };
}
