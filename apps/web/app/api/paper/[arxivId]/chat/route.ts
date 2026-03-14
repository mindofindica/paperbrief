/**
 * POST /api/paper/:arxivId/chat
 *
 * Pro-only conversational AI endpoint for paper pages.
 *
 * Request body:
 *   { messages: Array<{ role: 'user' | 'assistant'; content: string }>, persist?: boolean }
 *
 * Response (streaming):
 *   text/event-stream — SSE with delta chunks, then a final [DONE] event.
 *   OR (if streaming not supported): application/json { content: string }
 *
 * Auth: requires valid pb_session cookie (any logged-in user)
 * Plan: requires Pro subscription — 403 { error: "pro_required" } otherwise
 * Rate: max 20 messages per conversation (client enforced + server validated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaper } from '../../../../../lib/arxiv-db';
import { verifySessionCookie } from '../../../../../lib/auth';
import { getServiceSupabase } from '../../../../../lib/supabase';
import { getSubscription } from '../../../../../lib/stripe';

const MAX_MESSAGES = 20; // per conversation (user + assistant turns combined)
const MAX_QUESTION_LENGTH = 1000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(paper: { title: string; abstract: string | null; track: string | null }): string {
  return `You are a research assistant helping a user understand a specific academic paper.
You have deep expertise in machine learning, AI, and computer science.
Answer questions about THIS paper specifically. Be precise, insightful, and concise.
If the user asks something not covered by the abstract, acknowledge the limitation gracefully —
you only have access to the title and abstract, not the full paper.

Paper details:
Title: ${paper.title}
Track/Category: ${paper.track ?? 'Unknown'}
Abstract: ${paper.abstract ?? 'No abstract available.'}

Guidelines:
- Keep answers focused and useful (2-5 sentences unless depth is needed)
- Use concrete examples when clarifying technical concepts
- If asked to compare with other papers, draw on general knowledge but flag it's general knowledge
- Do NOT make up specific numbers, figures, or claims not in the abstract
- You may suggest follow-up questions at the end of a response`;
}

function validateMessages(messages: unknown): messages is ChatMessage[] {
  if (!Array.isArray(messages)) return false;
  if (messages.length === 0) return false;
  if (messages.length > MAX_MESSAGES) return false;
  return messages.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
      typeof (m as ChatMessage).content === 'string' &&
      (m as ChatMessage).content.length > 0 &&
      (m as ChatMessage).content.length <= MAX_QUESTION_LENGTH,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ arxivId: string }> },
) {
  const { arxivId } = await params;

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const sessionCookie = request.cookies.get('pb_session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const session = verifySessionCookie(sessionCookie);
  if (!session.valid || !session.userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  // ── Plan gate ─────────────────────────────────────────────────────────────────
  const subscription = await getSubscription(session.userId);
  if (subscription.plan !== 'pro') {
    return NextResponse.json(
      {
        error: 'pro_required',
        message: 'Paper Chat is a Pro feature. Upgrade to get unlimited AI conversations on every paper.',
        upgradeUrl: '/pricing',
      },
      { status: 403 },
    );
  }

  // ── Validate request body ─────────────────────────────────────────────────────
  let body: { messages?: unknown; persist?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!validateMessages(body.messages)) {
    return NextResponse.json(
      { error: 'invalid_messages', message: 'messages must be a non-empty array of up to 20 turns' },
      { status: 400 },
    );
  }

  const messages = body.messages as ChatMessage[];
  const persist = body.persist !== false; // default: save to history

  // ── Paper lookup ──────────────────────────────────────────────────────────────
  const paper = await getPaper(arxivId);
  if (!paper) {
    return NextResponse.json({ error: 'paper_not_found' }, { status: 404 });
  }

  // ── OpenRouter call ──────────────────────────────────────────────────────────
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  }

  const systemPrompt = buildSystemPrompt(paper);

  let aiResponse: Response;
  try {
    aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://paperbrief.ai',
        'X-Title': 'PaperBrief Paper Chat',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-3-5',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
  } catch (err) {
    console.error('[paper-chat] OpenRouter fetch error:', err);
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  }

  if (!aiResponse.ok) {
    const errText = await aiResponse.text().catch(() => '');
    console.error('[paper-chat] OpenRouter error:', aiResponse.status, errText);
    return NextResponse.json({ error: 'ai_error' }, { status: 502 });
  }

  // ── Stream back to client via SSE ─────────────────────────────────────────────
  const supabase = getServiceSupabase();
  let fullContent = '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = aiResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) {
                fullContent += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            } catch {
              // Malformed chunk — skip
            }
          }
        }
      } catch (err) {
        console.error('[paper-chat] stream error:', err);
      } finally {
        reader.releaseLock();
        // Signal completion
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }

      // ── Persist to history (fire-and-forget) ─────────────────────────────────
      if (persist && fullContent) {
        const lastUserMessage = messages.findLast((m) => m.role === 'user');
        const rows = [
          ...(lastUserMessage
            ? [{ user_id: session.userId, arxiv_id: arxivId, role: 'user' as const, content: lastUserMessage.content }]
            : []),
          { user_id: session.userId, arxiv_id: arxivId, role: 'assistant' as const, content: fullContent },
        ];
        supabase
          .from('paper_chat_messages')
          .insert(rows)
          .then(({ error }) => {
            if (error) console.error('[paper-chat] persist error:', error.message);
          });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// GET /api/paper/:arxivId/chat — fetch chat history for this paper (Pro only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ arxivId: string }> },
) {
  const { arxivId } = await params;

  const sessionCookie = request.cookies.get('pb_session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const session = verifySessionCookie(sessionCookie);
  if (!session.valid || !session.userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const subscription = await getSubscription(session.userId);
  if (subscription.plan !== 'pro') {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('paper_chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', session.userId)
    .eq('arxiv_id', arxivId)
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES);

  if (error) {
    console.error('[paper-chat][GET]', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

export const dynamic = 'force-dynamic';
