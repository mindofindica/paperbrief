import { NextRequest, NextResponse } from 'next/server';
import { verifySessionCookie } from '../../../../lib/auth';
import { getServiceSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

function getAuthUserId(request: NextRequest): string | null {
  const cookie = request.cookies.get('pb_session')?.value;
  if (!cookie) return null;
  const { valid, userId } = verifySessionCookie(cookie);
  return valid && userId ? userId : null;
}

async function generateQuizQuestions(title: string, content: string): Promise<Array<{
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}>> {
  const prompt = `Generate exactly 3 multiple-choice questions to test understanding of this research paper.

Paper title: ${title}
Content: ${content}

Requirements:
- Test conceptual understanding, NOT implementation details or exact numbers
- Each question has exactly 4 answer options (A-D)
- Questions should be answerable from the content provided
- One correct answer per question
- Explanations should be 1-2 sentences, clear and educational

Respond with ONLY valid JSON in this exact format:
[
  {
    "question": "...",
    "options": ["option A", "option B", "option C", "option D"],
    "correct_index": 0,
    "explanation": "..."
  }
]`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  
  // Extract JSON from the response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in LLM response');
  
  return JSON.parse(jsonMatch[0]);
}

export async function POST(request: NextRequest) {
  const userId = getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OpenRouter not configured' }, { status: 503 });
  }

  try {
    const supabase = getServiceSupabase();

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Get papers already quizzed today
    const { data: todayQuizzes } = await supabase
      .from('quiz_sessions')
      .select('arxiv_id')
      .eq('user_id', userId)
      .gte('created_at', todayIso);

    const alreadyQuizzedToday = new Set((todayQuizzes || []).map((q: { arxiv_id: string }) => q.arxiv_id));

    // Get candidate papers from reading_list
    const { data: readingListPapers } = await supabase
      .from('reading_list')
      .select('arxiv_id, updated_at')
      .eq('user_id', userId)
      .in('status', ['reading', 'read'])
      .order('updated_at', { ascending: false })
      .limit(50);

    // Get candidate papers from user_actions
    const { data: actionPapers } = await supabase
      .from('user_actions')
      .select('arxiv_id, created_at')
      .eq('user_id', userId)
      .in('action', ['love', 'save'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Combine and deduplicate, filtering out already quizzed today
    const candidates: string[] = [];
    const seen = new Set<string>();

    for (const p of (readingListPapers || [])) {
      if (!seen.has(p.arxiv_id) && !alreadyQuizzedToday.has(p.arxiv_id)) {
        candidates.push(p.arxiv_id);
        seen.add(p.arxiv_id);
      }
    }
    for (const p of (actionPapers || [])) {
      if (!seen.has(p.arxiv_id) && !alreadyQuizzedToday.has(p.arxiv_id)) {
        candidates.push(p.arxiv_id);
        seen.add(p.arxiv_id);
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No papers available for quiz. Save some papers to your reading list first!' }, { status: 400 });
    }

    // Find a paper with content
    let selectedArxivId: string | null = null;
    let paperContent: string | null = null;
    let paperTitle: string | null = null;

    for (const arxivId of candidates) {
      // Try to get content
      const { data: content } = await supabase
        .from('paper_content')
        .select('content, content_type')
        .eq('arxiv_id', arxivId)
        .in('content_type', ['tldr', 'medium'])
        .order('content_type', { ascending: false }) // 'tldr' < 'medium' alphabetically, so medium first
        .limit(1)
        .single();

      if (!content) continue;

      // Get title
      const { data: digestEntry } = await supabase
        .from('paper_digest_entries')
        .select('title')
        .eq('arxiv_id', arxivId)
        .limit(1)
        .single();

      if (!digestEntry) continue;

      selectedArxivId = arxivId;
      paperContent = content.content;
      paperTitle = digestEntry.title;
      break;
    }

    if (!selectedArxivId || !paperContent || !paperTitle) {
      return NextResponse.json({ error: 'No papers with content found. Try again after your digest is generated.' }, { status: 400 });
    }

    // Generate questions via LLM
    const questions = await generateQuizQuestions(paperTitle, paperContent);

    if (!Array.isArray(questions) || questions.length !== 3) {
      throw new Error('LLM returned invalid questions format');
    }

    // Insert quiz session
    const { data: session, error: insertError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: userId,
        arxiv_id: selectedArxivId,
        paper_title: paperTitle,
        questions,
        status: 'in_progress',
      })
      .select('id, arxiv_id, paper_title, questions, status, created_at')
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      id: session.id,
      arxiv_id: session.arxiv_id,
      paper_title: session.paper_title,
      questions: session.questions.map((q: { question: string; options: string[] }) => ({
        question: q.question,
        options: q.options,
      })),
    }, { status: 201 });
  } catch (err) {
    console.error('[quiz/generate POST]', err);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
