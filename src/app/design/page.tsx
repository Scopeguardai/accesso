import type { Metadata } from 'next';
import Workspace from '@/components/workspace/Workspace';
import { designData } from '@/lib/brand/design';
import { listBrands } from '@/lib/brand/load';
import { listDecks, summarize } from '@/lib/deck/store';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design system · Accesso' };

export default function DesignPage() {
  return (
    <Workspace
      renderedAt={Date.now()}
      key="design"
      view="design"
      brands={brandOptions()}
      decks={listDecks().map(summarize)}
      deck={null}
      designs={listBrands().map(designData)}
    />
  );
}
