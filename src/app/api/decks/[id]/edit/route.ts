import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRunning, runAgent } from '@/lib/agent/run';
import { readDeck } from '@/lib/deck/store';

export const runtime = 'nodejs';

const bodySchema = z.object({
  request: z.string().trim().min(2).max(2000),
  slideId: z.string().optional(),
});

/** Ask the agent to revise a deck: content or design, whole deck or one slide. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? readDeck(id) : null;
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (isRunning(id)) {
    return NextResponse.json({ error: 'This deck is already being worked on.' }, { status: 409 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write a request first.' }, { status: 400 });
  const { request: text, slideId } = parsed.data;
  if (slideId && !deck.slides.some((s) => s.id === slideId)) {
    return NextResponse.json({ error: `No slide "${slideId}" in this deck.` }, { status: 400 });
  }
  after(() => runAgent({ deckId: id, mode: 'edit', request: text, slideId }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
