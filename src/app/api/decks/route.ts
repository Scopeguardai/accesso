import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agent/run';
import { listBrands, loadBrand } from '@/lib/brand/load';
import { briefSchema, formatIssues, type Deck } from '@/lib/deck/schema';
import { newDeckId, writeDeck } from '@/lib/deck/store';

export const runtime = 'nodejs';

const bodySchema = z.object({ brand: z.string(), brief: briefSchema });

/** Create a deck from a brief and start the agent on it. Returns at once with the id. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: formatIssues(parsed.error) }, { status: 400 });
  }
  const { brand: brandId, brief } = parsed.data;
  if (!listBrands().includes(brandId)) {
    return NextResponse.json({ error: `Unknown brand "${brandId}"` }, { status: 400 });
  }
  const brand = loadBrand(brandId);
  const now = new Date().toISOString();
  const deck: Deck = {
    id: newDeckId(),
    brand: brandId,
    // One knowledge folder per brand for now; they are the same id.
    client: brandId,
    title: brief.topic.slice(0, 120),
    palette: brief.palette && brand.palettes[brief.palette] ? brief.palette : brand.defaultPalette,
    status: 'generating',
    brief,
    outline: [],
    slides: [],
    suggestions: [],
    activity: [],
    createdAt: now,
    updatedAt: now,
  };
  writeDeck(deck);
  after(() => runAgent({ deckId: deck.id, mode: 'create' }));
  return NextResponse.json({ id: deck.id }, { status: 201 });
}
