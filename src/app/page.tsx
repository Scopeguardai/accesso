import { readLayout } from '@/lib/layout-pref';
import Workspace from '@/components/workspace/Workspace';
import { listDecks, summarize } from '@/lib/deck/store';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function Home() {
  return (
    <Workspace
      renderedAt={Date.now()}
      layout={await readLayout()}
      key="new"
      brands={brandOptions()}
      decks={listDecks().map(summarize)}
      deck={null}
    />
  );
}
