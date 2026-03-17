/**
 * send-reading-nudge.ts
 *
 * Sends the weekly reading list nudge email via Resend.
 *
 * Called by POST /api/notify/reading-nudge (cron-triggered).
 */

import { Resend } from 'resend';
import * as React from 'react';
import { ReadingNudgeEmail, type NudgePaper } from './templates/reading-nudge';
import { buildUnsubscribeUrl } from '../unsubscribe-token';

export interface SendNudgeOptions {
  /** Recipient email */
  to: string;
  /** User ID (for personalised unsubscribe URL) */
  userId: string;
  /** Top papers to surface (max 3 will be rendered) */
  papers: NudgePaper[];
  /** Total unread count */
  unreadCount: number;
  /** Base URL override (default: https://paperbrief.ai) */
  baseUrl?: string;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendReadingNudgeEmail(opts: SendNudgeOptions): Promise<SendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping reading nudge');
    return { ok: false, error: 'RESEND_API_KEY not configured', skipped: true };
  }

  const base = opts.baseUrl ?? 'https://paperbrief.ai';
  const readingListUrl = `${base}/reading-list`;
  const unsubscribeUrl = buildUnsubscribeUrl(opts.userId, opts.to, base);

  try {
    const { data, error } = await resend.emails.send({
      from: 'PaperBrief <hello@paperbrief.ai>',
      to: [opts.to],
      subject: `📚 ${opts.unreadCount} paper${opts.unreadCount !== 1 ? 's' : ''} waiting in your reading list`,
      react: React.createElement(ReadingNudgeEmail, {
        email: opts.to,
        papers: opts.papers,
        unreadCount: opts.unreadCount,
        readingListUrl,
        unsubscribeUrl,
      }),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      console.error('[email] Resend error (reading-nudge):', error);
      return { ok: false, error: error.message };
    }

    console.log('[email] Reading nudge sent:', data?.id, '→', opts.to);
    return { ok: true, id: data!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Unexpected error (reading-nudge):', message);
    return { ok: false, error: message };
  }
}
