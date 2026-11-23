import { NextResponse } from 'next/server';
import { isRunning } from '@/lib/agent/run';
import { readDeck, updateDeck } from '@/lib/deck/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let deck = readDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A run that died with the server leaves the deck marked as generating.
  const stale = Date.now() - Date.parse(deck.updatedAt) > 90_000;
  if (deck.status === 'generating' && !isRunning(id) && stale) {
    deck = updateDeck(id, (d) => {
      d.status = d.slides.length > 0 ? 'ready' : 'error';
      d.statusNote = 'The last run was interrupted before it finished.';
    });
  }
  return NextResponse.json(deck);
}
