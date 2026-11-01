import type { Metadata } from 'next';
import { KioskScreen } from './kiosk-screen';

export const metadata: Metadata = { title: 'WishPix Kiosk' };

export default function KioskPage() {
  return <KioskScreen />;
}
