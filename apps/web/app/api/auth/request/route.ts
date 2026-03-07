import { NextResponse } from 'next/server';
import { createMagicToken } from '../../../../lib/auth';

const BASE_URL = process.env.PAPERBRIEF_BASE_URL || 'https://paperbrief.ai';

export async function GET() {
  try {
    const { token } = await createMagicToken('default');
    const verifyUrl = `${BASE_URL}/api/auth/verify?token=${token}`;
    return NextResponse.json({ ok: true, url: verifyUrl, token });
  } catch (err) {
    console.error('[auth/request]', err);
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 });
  }
}
