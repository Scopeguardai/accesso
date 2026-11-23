import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { readKnowledge } from '@/lib/knowledge/search';
import { deleteEntry, EntryNotFound, entryInputSchema, entryUsage, updateEntry } from '@/lib/knowledge/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ?brand=<id>&path=<client>/<file>.md; the path must already be one of that client's entries. */
function target(request: Request): { client: string; path: string } | null {
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand') ?? '';
  const path = url.searchParams.get('path') ?? '';
  if (!listBrands().includes(brand) || !path.startsWith(`${brand}/`)) return null;
  return { client: brand, path };
}

const notFound = () => NextResponse.json({ error: 'That entry no longer exists.' }, { status: 404 });

export async function GET(request: Request) {
  const t = target(request);
  const entry = t && readKnowledge(t.client, t.path);
  if (!t || !entry) return notFound();
  return NextResponse.json({ ...entry, usage: entryUsage(t.client, t.path) });
}

export async function PUT(request: Request) {
  const t = target(request);
  if (!t) return notFound();
  const parsed = entryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry and try again.' }, { status: 400 });
  }
  try {
    updateEntry(t.client, t.path, parsed.data);
  } catch (err) {
    if (err instanceof EntryNotFound) return notFound();
    throw err;
  }
  return NextResponse.json({ ...readKnowledge(t.client, t.path), usage: entryUsage(t.client, t.path) });
}

export async function DELETE(request: Request) {
  const t = target(request);
  if (!t) return notFound();
  try {
    deleteEntry(t.client, t.path);
  } catch (err) {
    if (err instanceof EntryNotFound) return notFound();
    throw err;
  }
  return NextResponse.json({ ok: true });
}
