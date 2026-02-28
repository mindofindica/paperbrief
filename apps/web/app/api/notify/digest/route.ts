import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '../../../../lib/auth';
import { getTodaysPapers } from '../../../../lib/arxiv-db';
import { execSync } from 'child_process';

const BASE_URL = process.env.PAPERBRIEF_BASE_URL || 'https://paperbrief.vercel.app';
const SIGNAL_SENDER = '+31643741711';
const SIGNAL_RECIPIENT = '+31639420916';

export async function POST(request: NextRequest) {
  // Simple auth check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const papers = getTodaysPapers();
    const { token } = await createMagicToken('default');
    const url = `${BASE_URL}/digest?token=${token}`;

    const message = `📚 Today's digest: ${papers.length} papers ready\n\n${url}`;

    // Send via signal-cli
    try {
      execSync(
        `signal-cli -u ${SIGNAL_SENDER} send -m "${message.replace(/"/g, '\\"')}" ${SIGNAL_RECIPIENT}`,
        { timeout: 30000 }
      );
    } catch (signalErr) {
      console.error('[notify/digest] Signal send failed:', signalErr);
      // Don't fail the whole request if signal-cli isn't available
    }

    return NextResponse.json({
      ok: true,
      url,
      messagePreview: message,
      paperCount: papers.length,
    });
  } catch (err) {
    console.error('[notify/digest]', err);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
