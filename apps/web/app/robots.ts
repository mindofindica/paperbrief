import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

/**
 * robots.txt via Next.js Metadata API.
 *
 * Public pages:  allowed (/, /trending, /search, /paper/*, /pricing, /stats, /rss)
 * Private pages: disallowed (auth flows, dashboard, API routes, admin)
 *
 * Sitemap is declared here so crawlers auto-discover it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/trending',
          '/search',
          '/paper/',
          '/pricing',
          '/stats',
          '/rss',
        ],
        disallow: [
          '/api/',
          '/auth/',
          '/login',
          '/dashboard/',
          '/onboarding/',
          '/reading-list/',
          '/recommend/',
          '/quiz/',
          '/digest/',
          '/gaps/',
          '/weekly/',
          '/preview/',
          '/papers/',    // individual user reading list pages
          '/unsubscribe/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
