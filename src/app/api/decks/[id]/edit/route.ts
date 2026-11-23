import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { isRunning, runAgent } from '@/lib/agent/run';
import { newEntryId, readDeck, updateDeck } from '@/lib/deck/store';

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
    return NextResponse.json({ error: 'The agent is still working on this deck. Wait for it to finish.' }, { status: 409 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write what should change first.' }, { status: 400 });
  const { request: text, slideId } = parsed.data;
  if (slideId && !deck.slides.some((s) => s.id === slideId)) {
    return NextResponse.json({ error: `This deck has no slide "${slideId}".` }, { status: 400 });
  }
  // Mark the deck as being worked on before replying, so the page starts
  // following the run straight away rather than after the agent picks it up.
  updateDeck(id, (d) => {
    d.thread.push({ id: newEntryId(), role: 'user', at: new Date().toISOString(), text, slideId });
    d.status = 'generating';
  });
  after(() => runAgent({ deckId: id, mode: 'edit', request: text, slideId }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
