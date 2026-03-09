'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLink {
  href: string;
  label: string;
  /** Match exactly or by prefix */
  exact?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { href: '/digest', label: 'Digest' },
  { href: '/search', label: 'Search', exact: true },
  { href: '/recommend', label: 'Recommend', exact: true },
  { href: '/reading-list', label: 'Reading List', exact: true },
  { href: '/stats', label: 'Stats', exact: true },
];

interface AppNavProps {
  /** Optional back link (label + href) shown on the left instead of the logo */
  back?: { href: string; label: string };
}

export default function AppNav({ back }: AppNavProps) {
  const pathname = usePathname();

  function isActive(link: NavLink): boolean {
    if (link.exact) return pathname === link.href;
    return pathname.startsWith(link.href);
  }

  return (
    <nav className="border-b border-gray-800 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        {/* Left: logo or back link */}
        {back ? (
          <Link
            href={back.href}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
          >
            <span aria-hidden="true">←</span>
            <span>{back.label}</span>
          </Link>
        ) : (
          <Link href="/digest" className="text-lg font-bold text-gray-100 hover:text-white transition-colors">
            📄 PaperBrief
          </Link>
        )}

        {/* Right: main links */}
        <div className="flex gap-4 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                isActive(link)
                  ? 'text-gray-100 font-medium'
                  : 'text-gray-500 hover:text-gray-300 transition-colors'
              }
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
