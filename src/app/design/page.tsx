import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Workspace from '@/components/workspace/Workspace';
import { designData } from '@/lib/brand/design';
import { listBrands } from '@/lib/brand/load';
import { listDecks, summarize } from '@/lib/deck/store';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design system · Accesso' };

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand } = await searchParams;
  const ids = listBrands();
  if (ids.length === 0) redirect('/');
  const brandId = brand && ids.includes(brand) ? brand : ids[0];
  return (
    <Workspace
      renderedAt={Date.now()}
      key={`design-${brandId}`}
      view="design"
      brandId={brandId}
      brands={brandOptions()}
      decks={listDecks().map(summarize)}
      deck={null}
      designs={ids.map(designData)}
    />
  );
}
