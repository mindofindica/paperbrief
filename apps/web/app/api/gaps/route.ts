import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getAuthUserId(request: NextRequest): string | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  const { valid, userId } = verifySessionCookie(cookie);
  return valid && userId ? userId : null;
}

interface GapResult {
  topic: string;
  why: string;
  suggestedPapers: Array<{
    arxiv_id: string;
    title: string;
    abstract: string | null;
    published_at: string | null;
  }>;
}

interface LLMGap {
  topic: string;
  why: string;
  searchTerms: string[];
}

async function detectGaps(
  trackNames: string[],
  trackKeywords: string[][],
  recentTitles: string[],
  recentCategories: string[],
  apiKey: string,
): Promise<LLMGap[]> {
  const tracksDesc = trackNames
    .map((name, i) => `- "${name}" (keywords: ${trackKeywords[i]?.join(', ') ?? 'none'})`)
    .join('\n');

  const prompt = `You are a research advisor helping an AI/ML researcher identify gaps in their reading coverage.

The researcher tracks these topics:
${tracksDesc}

Recent papers they've received in their digest (last 30 days, up to 30):
${recentTitles.slice(0, 30).map((t, i) => `${i + 1}. ${t}`).join('\n')}

Dominant paper categories in their recent digest: ${[...new Set(recentCategories)].slice(0, 10).join(', ')}

Your job: identify 3 important topic gaps — subtopics or adjacent areas within their tracked interests that are MISSING from their recent reading. These should be genuinely important for someone tracking those interests, not just random fields.

Respond with ONLY valid JSON:
[
  {
    "topic": "Short gap topic name (e.g. 'Test-Time Compute Scaling')",
    "why": "1-2 sentences explaining why this gap matters and what they're missing",
    "searchTerms": ["term1", "term2", "term3"]
  }
]

Rules:
- Return exactly 3 gaps
- Gaps must be specific subtopics, not broad fields
- searchTerms should be concrete, arxiv-searchable keywords
- If their reading is well-balanced, still find underexplored corners
- Focus on what's trending and important in 2025-2026`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3-5-sonnet',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? '';

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in LLM response');

  const gaps: LLMGap[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(gaps) || gaps.length === 0) throw new Error('Invalid gaps array');

  return gaps.slice(0, 3);
}

async function findPapersForGap(
  supabase: ReturnType<typeof getServiceSupabase>,
  searchTerms: string[],
  excludeArxivIds: Set<string>,
): Promise<GapResult['suggestedPapers']> {
  const results: GapResult['suggestedPapers'] = [];

  for (const term of searchTerms) {
    if (results.length >= 3) break;

    const { data: papers } = await supabase
      .from('papers')
      .select('arxiv_id, title, abstract, published_at')
      .ilike('title', `%${term}%`)
      .not('abstract', 'is', null)
      .order('published_at', { ascending: false })
      .limit(5);

    if (!papers) continue;

    for (const p of papers) {
      if (results.length >= 3) break;
      if (excludeArxivIds.has(p.arxiv_id)) continue;
      if (results.some((r) => r.arxiv_id === p.arxiv_id)) continue;
      results.push({
        arxiv_id: p.arxiv_id,
        title: p.title,
        abstract: p.abstract ?? null,
        published_at: p.published_at ?? null,
      });
    }
  }

  // Fallback: search abstracts if not enough from title search
  if (results.length < 2) {
    for (const term of searchTerms) {
      if (results.length >= 3) break;

      const { data: papers } = await supabase
        .from('papers')
        .select('arxiv_id, title, abstract, published_at')
        .ilike('abstract', `%${term}%`)
        .not('abstract', 'is', null)
        .order('published_at', { ascending: false })
        .limit(3);

      if (!papers) continue;

      for (const p of papers) {
        if (results.length >= 3) break;
        if (excludeArxivIds.has(p.arxiv_id)) continue;
        if (results.some((r) => r.arxiv_id === p.arxiv_id)) continue;
        results.push({
          arxiv_id: p.arxiv_id,
          title: p.title,
          abstract: p.abstract ?? null,
          published_at: p.published_at ?? null,
        });
      }
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  if (!apiKey) {
    return NextResponse.json({ error: 'LLM not configured' }, { status: 503 });
  }

  try {
    const supabase = getServiceSupabase();

    // 1. Fetch user's tracks
    const { data: tracks } = await supabase
      .from('tracks')
      .select('name, keywords, arxiv_cats')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(20);

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({
        gaps: [],
        message: 'No active tracks found. Add some research tracks to detect gaps.',
      });
    }

    // 2. Fetch recent digest entries (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: digestEntries } = await supabase
      .from('paper_digest_entries')
      .select('arxiv_id, papers(title, categories)')
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(60);

    // 3. Fetch reading list papers
    const { data: readingListItems } = await supabase
      .from('reading_list')
      .select('papers(arxiv_id, title, categories)')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
      .limit(30);

    // Collect recent paper data
    const recentTitles: string[] = [];
    const recentCategories: string[] = [];
    const seenArxivIds = new Set<string>();

    type PaperRow = { title: string; categories: string[] } | null;
    type DigestEntry = { arxiv_id: string; papers: PaperRow };
    type ReadingListEntry = { papers: (PaperRow & { arxiv_id?: string }) | null };

    const digestRows = (digestEntries ?? []) as unknown as DigestEntry[];
    for (const entry of digestRows) {
      const paper = entry.papers;
      if (paper && entry.arxiv_id) {
        seenArxivIds.add(entry.arxiv_id);
        recentTitles.push(paper.title);
        (paper.categories ?? []).forEach((c: string) => recentCategories.push(c));
      }
    }

    const readingListRows = (readingListItems ?? []) as unknown as ReadingListEntry[];
    for (const item of readingListRows) {
      const paper = item.papers;
      if (paper && paper.arxiv_id) {
        seenArxivIds.add(paper.arxiv_id);
        if (!recentTitles.includes(paper.title)) {
          recentTitles.push(paper.title);
        }
        (paper.categories ?? []).forEach((c: string) => recentCategories.push(c));
      }
    }

    if (recentTitles.length === 0) {
      return NextResponse.json({
        gaps: [],
        message: 'Not enough reading history yet. Check back after a few digests.',
      });
    }

    const trackNames = tracks.map((t) => t.name);
    const trackKeywords = tracks.map((t) => t.keywords ?? []);

    // 4. Detect gaps via LLM
    const llmGaps = await detectGaps(trackNames, trackKeywords, recentTitles, recentCategories, apiKey);

    // 5. For each gap, find suggested papers from our DB
    const gaps: GapResult[] = await Promise.all(
      llmGaps.map(async (gap) => {
        const suggestedPapers = await findPapersForGap(supabase, gap.searchTerms, seenArxivIds);
        return {
          topic: gap.topic,
          why: gap.why,
          suggestedPapers,
        };
      }),
    );

    return NextResponse.json({
      gaps,
      meta: {
        tracksAnalyzed: tracks.length,
        recentPapersAnalyzed: recentTitles.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[api/gaps GET]', err);
    return NextResponse.json({ error: 'Failed to analyze reading gaps' }, { status: 500 });
  }
}
