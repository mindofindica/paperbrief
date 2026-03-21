import type { MetadataRoute } from 'next';
import { getSitemapPapers, getSitemapAuthors } from '../lib/arxiv-db';
import { authorNameToSlug } from '../lib/author-pages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

/**
 * Static public routes with their update frequency and priority.
 * Auth routes, dashboard, API routes and private pages are intentionally excluded.
 */
const STATIC_ROUTES: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 1.0,
  },
  {
    url: `${SITE_URL}/trending`,
    lastModified: new Date(),
    changeFrequency: 'hourly',
    priority: 0.9,
  },
  {
    url: `${SITE_URL}/search`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/pricing`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    url: `${SITE_URL}/stats`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.6,
  },
  {
    url: `${SITE_URL}/rss`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.5,
  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch scored papers from the last 180 days (cap at 5 000 URLs)
  let paperRoutes: MetadataRoute.Sitemap = [];
  let authorRoutes: MetadataRoute.Sitemap = [];

  try {
    const papers = await getSitemapPapers(180, 5000);

    paperRoutes = papers.map((paper) => ({
      url: `${SITE_URL}/paper/${encodeURIComponent(paper.arxiv_id)}`,
      lastModified: paper.published_at
        ? new Date(paper.published_at)
        : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch {
    // DB unavailable at build time (e.g. during static analysis) — omit paper URLs
    paperRoutes = [];
  }

  try {
    // Author pages: unique authors from the last 180 days (cap at 2 000 authors)
    const authors = await getSitemapAuthors(180, 2000);

    // Deduplicate slugs (e.g. "J. Bengio" + "Yoshua Bengio" → same slug possible)
    const seen = new Set<string>();
    authorRoutes = authors
      .map((name) => authorNameToSlug(name))
      .filter((slug) => {
        if (!slug || seen.has(slug)) return false;
        seen.add(slug);
        return true;
      })
      .map((slug) => ({
        url: `${SITE_URL}/author/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }));
  } catch {
    authorRoutes = [];
  }

  return [...STATIC_ROUTES, ...paperRoutes, ...authorRoutes];
}
