/**
 * Dynamic Open Graph image for topic landing pages.
 *
 * Route: /topics/[slug]/opengraph-image (served automatically by Next.js)
 * Size:  1200×630 (standard OG / Twitter card)
 *
 * Design: dark card · topic emoji + name · description · paper count · PaperBrief brand
 *
 * Runtime: edge — no sqlite dependency, only Supabase queries via topics.ts
 */

import { ImageResponse } from 'next/og';
import { getTopicBySlug, getAllTopicsWithCounts } from '../../../lib/topics';

export const runtime = 'edge';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export function topicAccentColor(emoji: string): string {
  // Map topic emojis to distinct accent colours for visual variety
  const map: Record<string, string> = {
    '🤖': '#6366f1', // indigo  — LLM Agents
    '🔍': '#3b82f6', // blue    — RAG
    '🧠': '#8b5cf6', // violet  — Reasoning
    '⚙️': '#f59e0b', // amber   — Fine-tuning
    '👁️': '#06b6d4', // cyan    — Vision
    '💻': '#10b981', // emerald — Code generation
    '🛡️': '#ef4444', // red     — Alignment & Safety
    '📊': '#f97316', // orange  — Evaluation
    '⚡': '#eab308', // yellow  — Efficient Inference
    '🏗️': '#6366f1', // indigo  — Foundation Models
    '🎮': '#ec4899', // pink    — RL
    '🎨': '#a855f7', // purple  — Diffusion
  };
  return map[emoji] ?? '#6366f1';
}

// ── Image component ───────────────────────────────────────────────────────────

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = getTopicBySlug(slug);

  // ── Fallback: unknown topic ──────────────────────────────────────────────────
  if (!topic) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '36px' }}>📄</span>
            <span style={{ fontSize: '32px', fontWeight: 700, color: '#f9fafb' }}>PaperBrief</span>
          </div>
          <div style={{ fontSize: '22px', color: '#6b7280', marginTop: '16px' }}>
            Research Topic
          </div>
        </div>
      ),
      { ...size },
    );
  }

  // ── Fetch paper count for this topic ─────────────────────────────────────────
  let paperCount: number | null = null;
  try {
    const allTopics = await getAllTopicsWithCounts(30);
    const matched = allTopics.find((t) => t.slug === topic.slug);
    paperCount = matched?.count ?? null;
  } catch {
    // Non-fatal — image renders without the count
  }

  const accent = topicAccentColor(topic.emoji);
  const accentFaint = `${accent}20`; // ~12% opacity fill
  const accentMid  = `${accent}40`; // ~25% opacity border

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
        {/* Background accent orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-60px',
            width: '420px',
            height: '420px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accentFaint} 0%, transparent 70%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-40px',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)`,
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
          {/* Top row: brand */}
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

            {/* Research Topic badge */}
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
              Research Topic
            </div>
          </div>

          {/* Hero: emoji + topic name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px' }}>
            {/* Emoji in a coloured circle */}
            <div
              style={{
                width: '96px',
                height: '96px',
                borderRadius: '24px',
                background: accentFaint,
                border: `2px solid ${accentMid}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '52px',
                flexShrink: 0,
              }}
            >
              {topic.emoji}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                style={{
                  fontSize: '52px',
                  fontWeight: 800,
                  color: '#f9fafb',
                  lineHeight: 1.1,
                  letterSpacing: '-1px',
                }}
              >
                {topic.name}
              </div>
            </div>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: '26px',
              color: '#9ca3af',
              lineHeight: 1.45,
              flex: 1,
              maxWidth: '860px',
            }}
          >
            {truncate(topic.description, 140)}
          </div>

          {/* Bottom row: paper count + URL */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              {paperCount !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '32px',
                      fontWeight: 700,
                      color: accent,
                    }}
                  >
                    {paperCount}
                  </span>
                  <span style={{ fontSize: '18px', color: '#6b7280' }}>
                    papers this month
                  </span>
                </div>
              )}
            </div>

            <div style={{ fontSize: '18px', color: '#4b5563' }}>
              paperbrief.ai/topics/{slug}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
