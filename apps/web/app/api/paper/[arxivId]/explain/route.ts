import { NextRequest, NextResponse } from 'next/server';
import { getPaper } from '../../../../../lib/arxiv-db';
import { getServiceSupabase } from '../../../../../lib/supabase';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const LEVEL_PROMPTS: Record<string, string> = {
  tldr: 'Give a 1-2 sentence TL;DR of this paper. Be concise and accessible.',
  medium: 'Explain this paper in 3-4 paragraphs for a technical audience. Cover the key contribution, method, and results.',
  deep: 'Give a detailed explanation of this paper covering: motivation, methodology, key results, limitations, and implications. Use 5-8 paragraphs.',
  eli14: 'Explain this research paper to a curious 14-year-old with no technical background. Use simple analogies and everyday language. Avoid jargon. 2-3 short paragraphs.',
  undergrad: 'Explain this paper to an undergraduate computer science student who knows the basics of machine learning but hasn\'t specialised yet. Cover what problem it solves, how it solves it, and why the result matters. 3-4 paragraphs.',
  engineer: 'Explain this paper to a practising ML engineer. Be precise and technical. Cover: the core problem, the proposed approach and key design decisions, experimental results and benchmarks, practical implications, and any notable limitations. 4-6 paragraphs.',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ arxivId: string }> }
) {
  const { arxivId } = await params;
  const level = request.nextUrl.searchParams.get('level') || 'tldr';

  if (!LEVEL_PROMPTS[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Check cache
  const { data: cached } = await supabase
    .from('paper_explanations')
    .select('content')
    .eq('arxiv_id', arxivId)
    .eq('level', level)
    .single();

  if (cached) {
    return NextResponse.json({ content: cached.content, cached: true });
  }

  // Generate via OpenRouter
  const paper = await getPaper(arxivId);
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OpenRouter not configured' }, { status: 503 });
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        {
          role: 'user',
          content: `${LEVEL_PROMPTS[level]}\n\nTitle: ${paper.title}\n\nAbstract: ${paper.abstract}`,
        },
      ],
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || 'Explanation unavailable.';

  // Cache in Supabase
  await supabase.from('paper_explanations').upsert({
    arxiv_id: arxivId,
    level,
    content,
  });

  return NextResponse.json({ content, cached: false });
}

export const dynamic = 'force-dynamic';
