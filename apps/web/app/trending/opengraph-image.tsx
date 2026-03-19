/**
 * Dynamic Open Graph image for the /trending page.
 *
 * Route: /trending/opengraph-image (served automatically by Next.js)
 * Size:  1200×630 (standard OG / Twitter card)
 *
 * Design: dark card · fire emoji · "Trending This Week" headline
 *         · paper count stat · PaperBrief brand
 *
 * Runtime: edge — no sqlite dependency, only Supabase queries.
 */

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Fetch trending count ──────────────────────────────────────────────────────

async function getTrendingCount(days = 7): Promise<number | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.rpc('get_trending_papers', { days, lim: 100 });
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

// ── Image component ───────────────────────────────────────────────────────────

export default async function Image() {
  const paperCount = await getTrendingCount(7);
  const now = formatDate(new Date().toISOString());

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
        {/* Background accent orbs — warm fire tones */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-80px',
            width: '440px',
            height: '440px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(251,146,60,0.15) 0%, transparent 70%)',
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
            background: 'radial-gradient(circle, rgba(239,68,68,0.10) 0%, transparent 70%)',
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
          {/* Top row: brand + date badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '48px',
            }}
          >
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
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#e5e7eb', letterSpacing: '-0.5px' }}>
                PaperBrief
              </span>
            </div>

            <div
              style={{
                padding: '6px 18px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                fontSize: '16px',
                color: '#9ca3af',
                fontWeight: 500,
              }}
            >
              Updated {now}
            </div>
          </div>

          {/* Hero: fire icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '28px' }}>
            <div
              style={{
                width: '96px',
                height: '96px',
                borderRadius: '24px',
                background: 'rgba(251,146,60,0.15)',
                border: '2px solid rgba(251,146,60,0.30)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '52px',
                flexShrink: 0,
              }}
            >
              🔥
            </div>
            <div
              style={{
                fontSize: '56px',
                fontWeight: 800,
                color: '#f9fafb',
                lineHeight: 1.1,
                letterSpacing: '-1.5px',
              }}
            >
              Trending This Week
            </div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '26px',
              color: '#9ca3af',
              lineHeight: 1.45,
              flex: 1,
              maxWidth: '860px',
            }}
          >
            The ML papers scoring highest across all PaperBrief researcher digests — ranked by
            LLM relevance score and digest appearances.
          </div>

          {/* Bottom row: stats + URL */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: '24px',
              marginTop: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              {paperCount !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 700, color: '#fb923c' }}>
                    {paperCount}
                  </span>
                  <span style={{ fontSize: '18px', color: '#6b7280' }}>papers ranked</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: '#6b7280' }}>⏱ last 7 days · updated every 6h</span>
              </div>
            </div>

            <div style={{ fontSize: '18px', color: '#4b5563' }}>
              paperbrief.ai/trending
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
