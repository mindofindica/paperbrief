/**
 * Dynamic Open Graph image for /trending/today
 *
 * Route: /trending/today/opengraph-image (served automatically by Next.js)
 * Size:  1200×630 (standard OG / Twitter card)
 *
 * Design: dark gradient · "Top 5 Today" header · 5 paper rows with score bars
 *
 * Runtime: edge — only uses Supabase HTTP client
 */

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const revalidate = 3600; // 1 hour

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function scoreColor(score: number): string {
  if (score >= 9)   return '#f97316'; // orange
  if (score >= 7.5) return '#eab308'; // yellow
  if (score >= 6)   return '#3b82f6'; // blue
  return '#6b7280';                    // gray
}

function scoreEmoji(score: number): string {
  if (score >= 9)   return '🔥';
  if (score >= 7.5) return '⭐';
  return '✨';
}

interface PaperRow {
  arxiv_id: string;
  title: string;
  authors: string[];
  avg_score: number;
}

async function fetchTopPapers(): Promise<PaperRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try RPC with 1-day window
    const { data, error } = await supabase.rpc('get_trending_papers', { days: 1, lim: 5 });

    if (!error && data && data.length > 0) {
      return data.map((row: Record<string, unknown>) => ({
        arxiv_id: row.arxiv_id as string,
        title: row.title as string,
        authors: (row.authors as string[]) ?? [],
        avg_score: parseFloat(row.avg_score as string),
      }));
    }

    // Fallback: last 3 days from papers table
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: fallback } = await supabase
      .from('papers')
      .select('arxiv_id, title, authors, llm_score')
      .gte('ingested_at', threeDaysAgo)
      .not('llm_score', 'is', null)
      .order('llm_score', { ascending: false })
      .limit(5);

    return (fallback ?? []).map((row: Record<string, unknown>) => ({
      arxiv_id: row.arxiv_id as string,
      title: row.title as string,
      authors: (row.authors as string[]) ?? [],
      avg_score: Number(row.llm_score),
    }));
  } catch {
    return [];
  }
}

export default async function Image() {
  const papers = await fetchTopPapers();

  if (papers.length === 0) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: '#f1f5f9' }}>
            Top 5 ML Papers Today
          </div>
          <div style={{ fontSize: 20, color: '#64748b', marginTop: 12 }}>
            paperbrief.ai/trending/today
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'UTC',
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          padding: '48px 64px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div
            style={{
              fontSize: 16, fontWeight: 700, color: '#93c5fd',
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 999, padding: '6px 18px',
            }}
          >
            ⚡ Top 5 Today · {today}
          </div>
          <div style={{ fontSize: 16, color: '#475569' }}>
            paperbrief.ai
          </div>
        </div>

        {/* ── Papers ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {papers.slice(0, 5).map((paper, i) => {
            const color = scoreColor(paper.avg_score);
            const emoji = scoreEmoji(paper.avg_score);
            const barPct = Math.min(100, (paper.avg_score / 10) * 100);
            const author = paper.authors[0] ?? '';

            return (
              <div
                key={paper.arxiv_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12, padding: '10px 16px',
                }}
              >
                {/* Rank */}
                <div style={{ fontSize: 22, fontWeight: 800, color: '#374151', width: 28, textAlign: 'center' }}>
                  {i + 1}
                </div>

                {/* Title + author */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 2 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.3 }}>
                    {truncate(paper.title, 72)}
                  </div>
                  {author && (
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {truncate(author, 40)}
                    </div>
                  )}
                </div>

                {/* Score + bar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, width: 80 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color }}>
                    {emoji} {paper.avg_score.toFixed(1)}
                  </div>
                  <div style={{ width: 64, height: 4, background: '#1e293b', borderRadius: 999 }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 999 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer brand ── */}
        <div
          style={{
            fontSize: 15, fontWeight: 600, color: '#334155',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 20, marginTop: 12,
          }}
        >
          📄 PaperBrief — personalised daily arXiv digests · paperbrief.ai/trending/today
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
