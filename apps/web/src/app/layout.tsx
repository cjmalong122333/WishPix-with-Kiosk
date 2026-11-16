import type { Metadata, Viewport } from 'next';
import { Fredoka, Inter, Nunito } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Rounded letters for Pixi's thought bubble (only loaded on pages that use it).
const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-round', display: 'swap', preload: false });
// The kiosk screen's font (from the kiosk design in docs/design/kiosk).
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: 'WishPix',
  description: 'Voice-to-picture learning kiosk for early childhood education centers.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#11284a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="deep_blue" className={`${inter.variable} ${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
