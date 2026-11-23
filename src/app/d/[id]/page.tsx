import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DeckView from '@/components/DeckView';
import '@/components/deck.css';
import { loadBrand } from '@/lib/brand/load';
import { readDeck } from '@/lib/deck/store';

// A deck changes while the agent works on it, so never serve a cached copy.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const find = (id: string) => (/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? readDeck(id) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const deck = find((await params).id);
  return { title: deck?.title ?? 'Presentation', robots: { index: false } };
}

export default async function DeckPage({ params }: Props) {
  const deck = find((await params).id);
  if (!deck) notFound();
  return <DeckView deck={deck} brand={loadBrand(deck.brand)} />;
}
