export type DigestFrequencyOverride = 'auto' | 'daily' | 'twice_weekly' | 'weekly';

export function resolveFrequency(
  override: DigestFrequencyOverride,
  plan: 'free' | 'pro',
): 'daily' | 'twice_weekly' | 'weekly' {
  if (override === 'auto') {
    return plan === 'pro' ? 'daily' : 'weekly';
  }
  // Pro-only frequencies fall back to weekly if plan degrades
  if (plan === 'free' && (override === 'daily' || override === 'twice_weekly')) {
    return 'weekly';
  }
  return override;
}

export interface UserSettings {
  digestFrequencyOverride: DigestFrequencyOverride;
  digestFrequencyResolved: 'daily' | 'twice_weekly' | 'weekly';
  digestHour: number;
  digestPaused: boolean;
  plan: 'free' | 'pro';
}

export const PRO_FREQUENCIES: DigestFrequencyOverride[] = ['auto', 'daily', 'twice_weekly', 'weekly'];
export const FREE_FREQUENCIES: DigestFrequencyOverride[] = ['auto', 'weekly'];
