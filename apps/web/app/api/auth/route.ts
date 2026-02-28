import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '../../../lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const { token } = await createMagicToken('default');
    return NextResponse.json({ ok: true, token });
  } catch (err) {
    console.error('[auth][POST]', err);
    return NextResponse.json({ error: 'Failed to create magic link' }, { status: 500 });
  }
}
