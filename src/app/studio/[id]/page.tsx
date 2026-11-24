import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Workspace from '@/components/workspace/Workspace';
import { isRunning } from '@/lib/agent/run';
import { listDecks, readDeck, settleInterrupted, summarize } from '@/lib/deck/store';
import { brandOptions } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const find = (id: string) => (/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? readDeck(id) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const deck = find((await params).id);
  return { title: deck ? `${deck.title} · Accesso` : 'Accesso' };
}

export default async function StudioPage({ params }: Props) {
  const { id } = await params;
  const found = find(id);
  if (!found) notFound();
  const deck = settleInterrupted(found, isRunning(id));
  return (
    <Workspace
      renderedAt={Date.now()}
      key={id}
      brands={brandOptions()}
      decks={listDecks().map(summarize)}
      deck={deck}
    />
  );
}
