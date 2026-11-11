import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { EB_Garamond, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Account } from '@/components/Account';
import { Nav } from '@/components/Nav';
import { Providers } from './providers';
import './globals.css';

const serif = EB_Garamond({ subsets: ['latin'], weight: ['400', '500'], style: ['normal', 'italic'], variable: '--serif' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['300', '400'], variable: '--mono' });

export const metadata: Metadata = {
  title: 'biblecommit',
  description: 'Commit the Scripture you read.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2ede3' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body>
        <ClerkProvider>
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <defs>
              <filter id="wash" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={3} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale={2.4} xChannelSelector="R" yChannelSelector="G" result="d" />
                <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves={2} seed={11} result="g" />
                <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.3" result="ga" />
                <feComposite in="d" in2="ga" operator="in" />
              </filter>
              <filter id="bloomf" x="-50%" y="-50%" width="200%" height="200%">
                <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves={3} seed={5} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale={140} xChannelSelector="R" yChannelSelector="G" result="d" />
                <feGaussianBlur in="d" stdDeviation={26} />
              </filter>
            </defs>
          </svg>
          <svg className="bloom" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g filter="url(#bloomf)">
              <ellipse cx="900" cy="40" rx="260" ry="170" />
              <ellipse cx="780" cy="160" rx="120" ry="90" opacity=".6" />
              <ellipse cx="60" cy="980" rx="280" ry="160" opacity=".8" />
            </g>
          </svg>
          <div className="grain" />

          <header>
            <div className="mark">
              bible<i>commit</i>
            </div>
            <Nav variant="top" />
            <div className="hbtns">
              <Account />
            </div>
          </header>

          <Providers>
            <main>{children}</main>
          </Providers>

          <Nav variant="bar" />
        </ClerkProvider>
      </body>
    </html>
  );
}
