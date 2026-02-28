import { NextRequest, NextResponse } from 'next/server';
import { getPaper } from '../../../../lib/arxiv-db';
import { getServiceSupabase } from '../../../../lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ arxivId: string }> }
) {
  const { arxivId } = await params;
  const paper = getPaper(arxivId);
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  // Fetch cached explanations from Supabase
  const supabase = getServiceSupabase();
  const { data: explanations } = await supabase
    .from('paper_explanations')
    .select('level, content')
    .eq('arxiv_id', arxivId);

  return NextResponse.json({
    ...paper,
    explanations: explanations?.reduce((acc: Record<string, string>, e: { level: string; content: string }) => {
      acc[e.level] = e.content;
      return acc;
    }, {}) || {},
  });
}

export const dynamic = 'force-dynamic';
