import type { Metadata } from 'next';
import { PixiPreview } from './pixi-preview';

export const metadata: Metadata = { title: 'Pixi · WishPix' };

export default function PixiPage() {
  return <PixiPreview />;
}
