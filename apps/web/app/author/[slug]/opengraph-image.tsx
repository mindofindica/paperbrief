/**
 * Dynamic Open Graph image for author profile pages.
 *
 * Route: /author/[slug]/opengraph-image
 * Size:  1200×630 (standard OG / Twitter card)
 *
 * Design: dark card · author name · paper count · research areas · PaperBrief brand
 * Runtime: edge — no DB access needed, data from slug + static counts
 */

import { ImageResponse } from 'next/og';
import { getAuthorPapers, authorSlugToDisplayName } from '../../../lib/author-pages';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const CATEGORY_LABELS: Record<string, string> = {
  'cs.AI': 'Artificial Intelligence',
  'cs.LG': 'Machine Learning',
  'cs.CL': 'Computation & Language',
  'cs.CV': 'Computer Vision',
  'stat.ML': 'Statistical ML',
  'cs.RO': 'Robotics',
  'cs.NE': 'Neural & Evolutionary Computing',
  'cs.IR': 'Information Retrieval',
  'cs.HC': 'Human-Computer Interaction',
};

function topCategories(papers: { categories: string[] }[]): string[] {
  const counts: Map<string, number> = new Map();
  for (const paper of papers) {
    for (const cat of paper.categories) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => CATEGORY_LABELS[cat] ?? cat);
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getAuthorPapers(slug, 40);
  const { displayName, papers } = data;
  const areas = topCategories(papers);
  const paperCount = papers.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #030712 0%, #0f172a 60%, #1e1b4b 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background accent orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-150px',
            right: '-100px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            left: '-80px',
            width: '350px',
            height: '350px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '56px 64px 48px 64px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Top: PaperBrief brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '48px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
              }}
            >
              📄
            </div>
            <span style={{ fontSize: '22px', fontWeight: 700, color: '#9ca3af' }}>
              PaperBrief
            </span>
          </div>

          {/* Author icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                flexShrink: 0,
              }}
            >
              🔬
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '14px', color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                Researcher Profile
              </span>
              <span style={{ fontSize: '15px', color: '#6b7280' }}>
                PaperBrief Index
              </span>
            </div>
          </div>

          {/* Author name */}
          <div
            style={{
              fontSize: displayName.length > 24 ? '52px' : '64px',
              fontWeight: 800,
              color: '#f9fafb',
              letterSpacing: '-1px',
              lineHeight: 1.1,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {displayName}
          </div>

          {/* Research areas */}
          {areas.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
              {areas.map((area, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    fontSize: '16px',
                    color: '#a5b4fc',
                    fontWeight: 500,
                  }}
                >
                  {area}
                </div>
              ))}
            </div>
          )}

          {/* Bottom: stats */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: '24px',
              marginTop: '28px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span
                style={{
                  fontSize: '48px',
                  fontWeight: 800,
                  color: paperCount > 0 ? '#6366f1' : '#374151',
                  lineHeight: 1,
                }}
              >
                {paperCount > 0 ? paperCount : '—'}
              </span>
              <span style={{ fontSize: '20px', color: '#6b7280' }}>
                {paperCount === 1 ? 'paper indexed' : 'papers indexed'}
              </span>
            </div>
            <span style={{ fontSize: '16px', color: '#374151' }}>
              paperbrief.ai/author/{slug}
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
