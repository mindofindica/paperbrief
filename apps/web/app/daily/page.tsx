/**
 * /daily — Redirects to today's daily digest page.
 *
 * This is a server component that computes today's date at request time
 * and issues a permanent redirect to /daily/YYYY-MM-DD.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DailyIndexPage() {
  const today = new Date().toISOString().slice(0, 10);
  redirect(`/daily/${today}`);
}
