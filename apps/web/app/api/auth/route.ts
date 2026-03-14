import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '../../../lib/auth';
import { sendMagicLinkEmail } from '../../../lib/email/send-magic-link';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://paperbrief.ai';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const { token } = await createMagicToken('default');
    const magicUrl = `${BASE_URL}/api/auth/verify?token=${token}&redirect=/dashboard`;

    const result = await sendMagicLinkEmail(email, magicUrl);

    if (!result.ok && !(result as any).skipped) {
      console.error('[auth] Failed to send magic link email:', (result as any).error);
      return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[auth][POST]', err);
    return NextResponse.json({ error: 'Failed to create magic link' }, { status: 500 });
  }
}
