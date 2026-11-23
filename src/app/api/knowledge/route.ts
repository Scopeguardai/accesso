import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { formatIssues } from '@/lib/deck/schema';
import { listKnowledge, searchKnowledge, summarizeEntry } from '@/lib/knowledge/search';
import { createEntry, entryInputSchema } from '@/lib/knowledge/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The client's knowledge folder: brands and knowledge folders share an id. */
function client(url: URL): string | null {
  const brand = url.searchParams.get('brand') ?? '';
  return listBrands().includes(brand) ? brand : null;
}

/** Every entry, or with ?q= the entries the agent's own search would return, best first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const c = client(url);
  if (!c) return NextResponse.json({ error: 'Unknown brand.' }, { status: 400 });
  const q = url.searchParams.get('q')?.trim();
  if (q) return NextResponse.json(searchKnowledge(c, q, 50));
  return NextResponse.json(listKnowledge(c).map(summarizeEntry));
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const c = client(url);
  if (!c) return NextResponse.json({ error: 'Unknown brand.' }, { status: 400 });
  const parsed = entryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? formatIssues(parsed.error) }, { status: 400 });
  }
  const path = createEntry(c, parsed.data);
  return NextResponse.json({ path }, { status: 201 });
}
