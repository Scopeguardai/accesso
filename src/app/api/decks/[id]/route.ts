import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isRunning } from '@/lib/agent/run';
import { loadBrand } from '@/lib/brand/load';
import { readDeck, settleInterrupted, updateDeck } from '@/lib/deck/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const find = (id: string) => (/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? readDeck(id) : null);

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const deck = find(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(settleInterrupted(deck, isRunning(id)));
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  palette: z.string().optional(),
});

/** Direct changes that need no agent: rename the deck, switch its palette. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const deck = find(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const { title, palette } = parsed.data;
  if (palette && !loadBrand(deck.brand).palettes[palette]) {
    return NextResponse.json({ error: `Unknown palette "${palette}".` }, { status: 400 });
  }
  const next = updateDeck(id, (d) => {
    if (title) d.title = title;
    if (palette) d.palette = palette;
  });
  return NextResponse.json(next);
}
