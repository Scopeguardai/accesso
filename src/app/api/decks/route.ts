import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agent/run';
import { listBrands, loadBrand } from '@/lib/brand/load';
import { briefObjectSchema, formatIssues, type Deck } from '@/lib/deck/schema';
import { listDecks, newDeckId, newEntryId, summarize, writeDeck } from '@/lib/deck/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Summaries for the projects list. */
export async function GET() {
  return NextResponse.json(listDecks().map(summarize));
}

const bodySchema = z.object({ brand: z.string(), brief: briefObjectSchema });

/** A working title until the agent names the deck: the prompt's first line, shortened. */
function provisionalTitle(prompt: string): string {
  const line = prompt.split('\n').find((l) => l.trim())?.trim() ?? 'New presentation';
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}

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
    // One knowledge folder per brand for now; they share the id.
    client: brandId,
    title: provisionalTitle(brief.prompt),
    palette: brief.palette && brand.palettes[brief.palette] ? brief.palette : brand.defaultPalette,
    status: 'generating',
    brief,
    outline: [],
    slides: [],
    suggestions: [],
    thread: [{ id: newEntryId(), role: 'user', at: now, text: brief.prompt, brief }],
    createdAt: now,
    updatedAt: now,
  };
  writeDeck(deck);
  after(() => runAgent({ deckId: deck.id, mode: 'create' }));
  return NextResponse.json({ id: deck.id }, { status: 201 });
}
