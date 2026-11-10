'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'today' },
  { href: '/canon', label: 'canon' },
] as const;

export function Nav({ variant }: { variant: 'top' | 'bar' }) {
  const path = usePathname();
  return (
    <nav className={variant === 'top' ? 'toptabs' : 'tabbar'}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? 'on' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
