import type { Metadata } from 'next';
import Workspace from '@/components/workspace/Workspace';
import { listDecks, summarize } from '@/lib/deck/store';
import { listKnowledge, summarizeEntry } from '@/lib/knowledge/search';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Knowledge base · Accesso' };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ entry?: string }> }) {
  const { entry } = await searchParams;
  const brands = brandOptions();
  // An entry path starts with its brand's folder, e.g. "fossefall/positioning.md".
  const fromEntry = entry?.split('/')[0];
  const brandId = brands.find((b) => b.id === fromEntry)?.id ?? brands[0]?.id;
  const knowledge = brandId ? listKnowledge(brandId).map(summarizeEntry) : [];
  const validEntry = entry && knowledge.some((k) => k.path === entry) ? entry : undefined;
  return (
    <Workspace
      renderedAt={Date.now()}
      key="knowledge"
      view="knowledge"
      brands={brands}
      decks={listDecks().map(summarize)}
      deck={null}
      knowledge={knowledge}
      entry={validEntry}
    />
  );
}
