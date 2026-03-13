/**
 * Static Open Graph image for PaperBrief root pages.
 *
 * Route: /opengraph-image (served automatically by Next.js for the root layout)
 * Size:  1200×630 (standard OG / Twitter card)
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
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
          background: 'linear-gradient(135deg, #030712 0%, #0f172a 60%, #1e1b4b 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Accent orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
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

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '0 80px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
              }}
            >
              📄
            </div>
            <span
              style={{
                fontSize: '48px',
                fontWeight: 700,
                color: '#f9fafb',
                letterSpacing: '-1px',
              }}
            >
              PaperBrief
            </span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: '44px',
              fontWeight: 700,
              color: '#f9fafb',
              lineHeight: 1.2,
              marginBottom: '20px',
              letterSpacing: '-0.5px',
            }}
          >
            Stop drowning in arXiv.
          </div>

          {/* Subheading */}
          <div
            style={{
              fontSize: '24px',
              color: '#6b7280',
              lineHeight: 1.5,
              maxWidth: '800px',
            }}
          >
            Your personal ML research digest — 500+ papers a day, ranked by what matters to{' '}
            <span style={{ color: '#a5b4fc' }}>your</span> work.
          </div>

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              gap: '48px',
              marginTop: '48px',
            }}
          >
            {[
              { value: '500+', label: 'Papers/day' },
              { value: 'AI', label: 'Ranked & summarised' },
              { value: 'Weekly', label: 'Digest to your inbox' },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: '#a5b4fc',
                  }}
                >
                  {stat.value}
                </span>
                <span style={{ fontSize: '16px', color: '#4b5563' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '18px',
            color: '#374151',
            letterSpacing: '1px',
          }}
        >
          paperbrief.ai
        </div>
      </div>
    ),
    { ...size },
  );
}
