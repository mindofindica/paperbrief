/**
 * Dynamic OG image for /daily/[date]
 *
 * Generated at request time (edge runtime).
 * Shows: date, top 3 paper titles, score badges.
 * Size: 1200×630 (standard OG / Twitter card)
 */

import { ImageResponse } from 'next/og';
import { getTopPapersForDate, formatDailyDate } from '../../../lib/daily-digest';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = {
  params: Promise<{ date: string }>;
};

export default async function Image({ params }: Props) {
  const { date } = await params;

  // Fetch top 3 papers for OG card
  let papers: Awaited<ReturnType<typeof getTopPapersForDate>> = [];
  let formattedDate = date;

  try {
    papers = await getTopPapersForDate(date, 3);
    formattedDate = formatDailyDate(date);
  } catch {
    // Gracefully degrade to a generic card
  }

  const topPapers = papers.slice(0, 3);

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
          padding: '64px',
        }}
      >
        {/* Accent orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-120px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '30px',
              }}
            >
              📄
            </div>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#f9fafb' }}>PaperBrief</span>
          </div>

          <div
            style={{
              padding: '8px 20px',
              borderRadius: '999px',
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.4)',
              fontSize: '18px',
              color: '#a5b4fc',
              fontWeight: 600,
            }}
          >
            Daily Digest
          </div>
        </div>

        {/* Date */}
        <div style={{ fontSize: '48px', fontWeight: 700, color: '#f9fafb', marginBottom: '32px', letterSpacing: '-1px' }}>
          {formattedDate}
        </div>

        {/* Paper list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
          {topPapers.length === 0 ? (
            <div style={{ fontSize: '24px', color: '#6b7280' }}>Top ML papers from arXiv, ranked by AI</div>
          ) : (
            topPapers.map((paper, i) => (
              <div
                key={paper.arxiv_id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '16px 20px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'rgba(99,102,241,0.3)',
                    color: '#a5b4fc',
                    fontSize: '14px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {i + 1}
                </span>

                {/* Title */}
                <span
                  style={{
                    fontSize: '18px',
                    color: '#e5e7eb',
                    lineHeight: 1.4,
                    flex: 1,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {paper.title}
                </span>

                {/* Score */}
                <span
                  style={{
                    fontSize: '14px',
                    color: '#fbbf24',
                    fontWeight: 700,
                    flexShrink: 0,
                    paddingTop: '4px',
                  }}
                >
                  {paper.llm_score.toFixed(1)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '32px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ fontSize: '16px', color: '#374151' }}>paperbrief.ai/daily/{date}</span>
          <span style={{ fontSize: '14px', color: '#374151' }}>500+ papers ranked daily · free</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
