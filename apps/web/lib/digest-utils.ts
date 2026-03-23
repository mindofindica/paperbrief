/**
 * Utility functions for digest timing and display logic.
 * Kept in lib/ so Next.js page files only export the default page component.
 */

/**
 * Returns the next scheduled digest delivery time (07:30 UTC daily).
 */
export function getNextDigestTime(now: Date = new Date()): Date {
  const RUN_HOUR_UTC = 7;
  const RUN_MIN_UTC = 30;

  const todayRun = new Date(now);
  todayRun.setUTCHours(RUN_HOUR_UTC, RUN_MIN_UTC, 0, 0);

  return now < todayRun
    ? todayRun
    : new Date(todayRun.getTime() + 24 * 60 * 60 * 1000);
}
