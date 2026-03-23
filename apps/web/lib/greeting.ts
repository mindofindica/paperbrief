export function getGreeting(now: Date = new Date()): string {
  const hour = now.getUTCHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
