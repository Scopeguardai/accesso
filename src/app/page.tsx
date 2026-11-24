import Workspace from '@/components/workspace/Workspace';
import { listDecks, summarize } from '@/lib/deck/store';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <Workspace
      renderedAt={Date.now()}
      key="new"
      brands={brandOptions()}
      decks={listDecks().map(summarize)}
      deck={null}
    />
  );
}
