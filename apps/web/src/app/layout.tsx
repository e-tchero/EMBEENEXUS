import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

import './globals.css';

/**
 * Manrope — the canonical Embee Nexus typeface (founder decision).
 * Weights 300–800 per the brand kit; the tokenized family
 * (`--font-manrope`) is consumed by globals.css so every surface inherits it.
 * The system stack remains the fallback while the font loads.
 */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: {
    default: 'Embee Nexus',
    template: '%s · Embee Nexus',
  },
  description: 'Mobile-first motorcycle delivery platform for Abuja.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
