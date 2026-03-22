/**
 * Dynamic Open Graph image for /today
 *
 * Route: /today/opengraph-image (served automatically by Next.js)
 * Size:  1200×630 (standard OG / Twitter card)
 *
 * Design: dark gradient · "Paper of the Day" · score · title · author · brand
 *
 * Runtime: edge — only uses Supabase HTTP client
 */

import { ImageResponse } from 'next/og';
import { getPaperOfTheDay, getScoreBadge } from '../../lib/today';

export const runtime = 'edge';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export default async function Image() {
  const paper = await getPaperOfTheDay();

  if (!paper) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#e2e8f0' }}>
            Paper of the Day
          </div>
          <div style={{ fontSize: 20, color: '#64748b', marginTop: 12 }}>
            paperbrief.ai/today
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const badge = getScoreBadge(paper.llmScore);
  const firstAuthor = paper.authors[0] ?? 'Unknown author';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '64px 72px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
          position: 'relative',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#93c5fd',
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 999,
              padding: '6px 20px',
            }}
          >
            📄 Paper of the Day
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#fbbf24',
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 999,
              padding: '6px 20px',
            }}
          >
            {badge.emoji} {badge.label} · {paper.llmScore.toFixed(1)}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: '#f1f5f9',
            lineHeight: 1.2,
            marginBottom: 32,
            flex: 1,
          }}
        >
          {truncate(paper.title, 80)}
        </div>

        {/* Author */}
        <div
          style={{
            fontSize: 22,
            color: '#94a3b8',
            marginBottom: 40,
          }}
        >
          {firstAuthor}
          {paper.authors.length > 1 && ` + ${paper.authors.length - 1} more`}
        </div>

        {/* Brand */}
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#475569',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 24,
          }}
        >
          paperbrief.ai/today
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
