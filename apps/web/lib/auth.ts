import { getServiceSupabase } from './supabase';
import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me-in-production!';

export async function createMagicToken(userId: string = 'default'): Promise<{ token: string; expiresAt: string }> {
  const supabase = getServiceSupabase();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('magic_tokens').insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
    used: false,
  });

  if (error) throw new Error(`Failed to create magic token: ${error.message}`);
  return { token, expiresAt };
}

export async function verifyMagicToken(token: string): Promise<{ valid: boolean; userId?: string }> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('magic_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) return { valid: false };
  if (data.used) return { valid: false };
  if (new Date(data.expires_at) < new Date()) return { valid: false };

  // Mark as used
  await supabase.from('magic_tokens').update({ used: true }).eq('token', token);

  return { valid: true, userId: data.user_id };
}

export function createSessionCookie(userId: string): string {
  const payload = JSON.stringify({ userId, iat: Date.now() });
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${hmac}`).toString('base64');
}

export function verifySessionCookie(cookie: string): { valid: boolean; userId?: string } {
  try {
    const decoded = Buffer.from(cookie, 'base64').toString('utf-8');
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return { valid: false };

    const payload = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

    if (signature !== expected) return { valid: false };

    const data = JSON.parse(payload);
    return { valid: true, userId: data.userId };
  } catch {
    return { valid: false };
  }
}
