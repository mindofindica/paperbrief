/**
 * Dynamic Open Graph image for paper detail pages.
 *
 * Route: /paper/[arxivId]/opengraph-image (served automatically by Next.js)
 * Size:  1200×630 (standard OG / Twitter card)
 *
 * Design: dark card · paper title · authors · score badge · PaperBrief brand
 *
 * Runtime: nodejs — required because getPaper() uses better-sqlite3.
 */

import { ImageResponse } from 'next/og';
import { getPaper } from '../../../lib/arxiv-db';

export const runtime = 'nodejs';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAuthors(authorsJson: string | null): string[] {
  if (!authorsJson) return [];
  try {
    const parsed = JSON.parse(authorsJson);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // fall through
  }
  return [authorsJson];
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function scoreColor(score: number): string {
  if (score >= 8) return '#34d399'; // emerald-400
  if (score >= 6) return '#60a5fa'; // blue-400
  if (score >= 4) return '#fbbf24'; // amber-400
  return '#9ca3af';                 // gray-400
}

function formatTrack(track: string | null): string {
  if (!track) return 'ML Research';
  // e.g. "cs.LG" → "cs.LG" or "llm" → "LLM"
  return track.length <= 6 ? track.toUpperCase() : track;
}

// ── Image component ───────────────────────────────────────────────────────────

export default async function Image({
  params,
}: {
  params: Promise<{ arxivId: string }>;
}) {
  const { arxivId } = await params;
  const paper = await getPaper(arxivId);

  // ── Fallback card (paper not found) ─────────────────────────────────────────
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
            background: 'linear-gradient(135deg, #030712 0%, #0f172a 100%)',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
              }}
            >
              📄
            </div>
            <span style={{ fontSize: '32px', fontWeight: 700, color: '#f9fafb' }}>PaperBrief</span>
          </div>
          <div style={{ fontSize: '22px', color: '#6b7280' }}>Your personal ML research digest</div>
        </div>
      ),
      { ...size },
    );
  }

  // ── Paper data ───────────────────────────────────────────────────────────────
  const authors = parseAuthors(paper.authors);
  const authorDisplay =
    authors.length === 0
      ? 'Unknown authors'
      : authors.length <= 3
      ? authors.join(', ')
      : `${authors.slice(0, 3).join(', ')} +${authors.length - 3} more`;

  const title = truncate(paper.title, 110);
  const score = paper.llm_score ?? null;
  const track = formatTrack(paper.track);
  const published = paper.published_at
    ? new Date(paper.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #030712 0%, #0f172a 60%, #1e1b4b 100%)',
          padding: '0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background accent orb */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-60px',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Main content */}
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
          {/* Top row: brand + track badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '40px',
            }}
          >
            {/* PaperBrief wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              <span
                style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#e5e7eb',
                  letterSpacing: '-0.5px',
                }}
              >
                PaperBrief
              </span>
            </div>

            {/* Track badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  background: 'rgba(99,102,241,0.2)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#a5b4fc',
                }}
              >
                {track}
              </div>
              {published && (
                <div
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    background: 'rgba(255,255,255,0.06)',
                    fontSize: '15px',
                    color: '#6b7280',
                  }}
                >
                  {published}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: title.length > 80 ? '34px' : '40px',
              fontWeight: 700,
              color: '#f9fafb',
              lineHeight: 1.25,
              letterSpacing: '-0.5px',
              flex: 1,
              display: 'flex',
              alignItems: 'flex-start',
            }}
          >
            {title}
          </div>

          {/* Authors */}
          <div
            style={{
              fontSize: '20px',
              color: '#9ca3af',
              marginTop: '24px',
              marginBottom: '32px',
            }}
          >
            {truncate(authorDisplay, 90)}
          </div>

          {/* Bottom row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: '24px',
            }}
          >
            {/* arXiv ID */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', color: '#4b5563' }}>arxiv.org/abs/</span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#6366f1',
                }}
              >
                {arxivId}
              </span>
            </div>

            {/* Score badge */}
            {score !== null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${scoreColor(score)}40`,
                }}
              >
                <span style={{ fontSize: '15px', color: '#6b7280' }}>Relevance</span>
                <span
                  style={{
                    fontSize: '26px',
                    fontWeight: 700,
                    color: scoreColor(score),
                    lineHeight: 1,
                  }}
                >
                  {score.toFixed(1)}
                </span>
                <span style={{ fontSize: '15px', color: '#4b5563' }}>/10</span>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
