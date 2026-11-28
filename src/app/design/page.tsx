import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Workspace from '@/components/workspace/Workspace';
import { designData } from '@/lib/brand/design';
import { listBrands } from '@/lib/brand/load';
import { listDecks, summarize } from '@/lib/deck/store';
import { listKnowledge, summarizeEntry } from '@/lib/knowledge/search';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design system · Voila' };

/**
 * A brand's design system: its brand design, its presentation styles and its knowledge
 * base, as three tabs of one place. `?tab=styles` and `?tab=knowledge` open the others;
 * `?entry=` opens a knowledge entry.
 */
export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; tab?: string; entry?: string }>;
}) {
  const { brand, tab, entry } = await searchParams;
  const ids = listBrands();
  if (ids.length === 0) redirect('/');
  // An entry path starts with its brand's folder, e.g. "fossefall/positioning.md".
  const fromEntry = entry?.split('/')[0];
  const brandId = (fromEntry && ids.includes(fromEntry) && fromEntry) || (brand && ids.includes(brand) ? brand : ids[0]);
  const common = { renderedAt: Date.now(), brandId, brands: brandOptions(), decks: listDecks().map(summarize), deck: null };

  if (tab === 'styles' || tab === 'knowledge' || entry) {
    const knowledge = listKnowledge(brandId).map(summarizeEntry);
    return (
      <Workspace
        {...common}
        key={`knowledge-${brandId}`}
        view="knowledge"
        knowledge={knowledge}
        entry={entry && knowledge.some((k) => k.path === entry) ? entry : undefined}
        kbTab={tab === 'styles' ? 'styles' : 'facts'}
      />
    );
  }
  return <Workspace {...common} key={`design-${brandId}`} view="design" designs={ids.map(designData)} />;
}
