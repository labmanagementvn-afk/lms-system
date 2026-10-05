'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

export interface MobileTab {
  href: string;
  icon: ReactNode;
  label: string;
}

/**
 * Phone-sized frame for the parent and driver apps: sticky title bar, scrolling
 * body and a bottom tab bar. The portal's sidebar layout is not used here.
 */
export function MobileShell({ title, extra, tabs, children, maxWidth = 480 }: { title: ReactNode; extra?: ReactNode; tabs: MobileTab[]; children: ReactNode; maxWidth?: number }) {
  const pathname = usePathname();
  const active = tabs
    .map((t) => t.href)
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ maxWidth, margin: '0 auto', minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: '#1d4ed8',
            color: '#fff',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {extra}
        </header>
        <main style={{ flex: 1, padding: 12, paddingBottom: 72 }}>{children}</main>
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            margin: '0 auto',
            maxWidth,
            background: '#fff',
            borderTop: '1px solid #e5e7eb',
            display: 'grid',
            gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
            zIndex: 10,
          }}
        >
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 0 10px',
                fontSize: 11,
                color: t.href === active ? '#1d4ed8' : '#6b7280',
                fontWeight: t.href === active ? 600 : 400,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1.2 }}>{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
