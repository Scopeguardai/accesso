import { after, NextResponse } from 'next/server';
import { beginFolderSearch, clearFolderSearch, isSearching, readFolderSearch, runFolderSearch } from '@/lib/brand/folder-agent';
import { listBrands } from '@/lib/brand/load';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Ask the agent to search the brand's folder. Poll GET /api/design/sources for the result. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { brand?: unknown } | null;
  const brand = typeof body?.brand === 'string' ? body.brand : '';
  if (!listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  const problem = beginFolderSearch(brand);
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  after(() => runFolderSearch(brand));
  return NextResponse.json(readFolderSearch(brand), { status: 202 });
}

/** Dismiss the agent's picks. */
export async function DELETE(request: Request) {
  const brand = new URL(request.url).searchParams.get('brand') ?? '';
  if (!listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  if (isSearching(brand)) return NextResponse.json({ error: 'Wait for the search to finish first.' }, { status: 409 });
  clearFolderSearch(brand);
  return NextResponse.json({ status: 'none' });
}
