import { after, NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { beginStyleDraft, readStyleDraft, runStyleDraft } from '@/lib/knowledge/style-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Ask the agent to study the uploaded examples and draft a style. Poll GET ../examples for the result. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { brand?: unknown } | null;
  const brand = typeof body?.brand === 'string' ? body.brand : '';
  if (!listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  const problem = beginStyleDraft(brand);
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  after(() => runStyleDraft(brand));
  return NextResponse.json(readStyleDraft(brand), { status: 202 });
}
