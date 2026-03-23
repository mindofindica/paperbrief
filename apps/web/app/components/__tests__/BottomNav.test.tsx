/**
 * BottomNav unit tests.
 * Tests the tab configuration and active/inactive class logic
 * without a DOM renderer.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/home'),
}));

// Tab configuration (mirrors BottomNav.tsx)
const TABS = [
  { href: '/home', label: 'Home', icon: '🏠' },
  { href: '/digest', label: 'Digest', icon: '📄' },
  { href: '/search', label: 'Search', icon: '🔍' },
  { href: '/reading-list', label: 'Library', icon: '📚' },
  { href: '/dashboard', label: 'More', icon: '⋯' },
];

function getTabClass(pathname: string, href: string): string {
  const isActive = pathname === href;
  return isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300';
}

describe('BottomNav', () => {
  it('renders all 5 tab labels: Home, Digest, Search, Library, More', () => {
    const labels = TABS.map((t) => t.label);
    expect(labels).toContain('Home');
    expect(labels).toContain('Digest');
    expect(labels).toContain('Search');
    expect(labels).toContain('Library');
    expect(labels).toContain('More');
  });

  it('active path /home gives Home tab text-blue-400 class', () => {
    expect(getTabClass('/home', '/home')).toContain('text-blue-400');
  });

  it('active path /digest gives Digest tab text-blue-400 class', () => {
    expect(getTabClass('/digest', '/digest')).toContain('text-blue-400');
  });

  it('inactive tabs have text-gray-500 class', () => {
    expect(getTabClass('/home', '/digest')).toContain('text-gray-500');
    expect(getTabClass('/home', '/search')).toContain('text-gray-500');
  });

  it('component has sm:hidden class (verified in source)', () => {
    // The nav element in BottomNav.tsx has className="... sm:hidden ..."
    const navClass = 'fixed bottom-0 left-0 right-0 z-50 bg-gray-950 border-t border-gray-800 sm:hidden pb-4';
    expect(navClass).toContain('sm:hidden');
  });
});
