import { redirect } from 'next/navigation';
import Workspace from '@/components/workspace/Workspace';
import { listDecks, summarize } from '@/lib/deck/store';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

/** Make a presentation: the brief, then the gallery. `?brand=` opens it on that brand. */
export default async function NewPresentation({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand } = await searchParams;
  const brands = brandOptions();
  if (brands.length === 0) redirect('/');
  return (
    <Workspace
      renderedAt={Date.now()}
      key={`new-${brand ?? ''}`}
      brands={brands}
      brandId={brands.some((b) => b.id === brand) ? brand : undefined}
      decks={listDecks().map(summarize)}
      deck={null}
    />
  );
}
