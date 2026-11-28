import { NextResponse } from 'next/server';
import { DesignError, saveLook } from '@/lib/brand/design';
import { listBrands } from '@/lib/brand/load';
import { designChoiceSchema } from '@/lib/brand/looks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Set a brand's deck design (the look and its options) without touching anything else. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { brand?: unknown; design?: unknown } | null;
  const brand = typeof body?.brand === 'string' ? body.brand : '';
  if (!listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  const choice = designChoiceSchema.safeParse(body?.design);
  if (!choice.success || !choice.data.look) return NextResponse.json({ error: 'Choose a design.' }, { status: 400 });
  try {
    return NextResponse.json(saveLook(brand, choice.data));
  } catch (err) {
    if (err instanceof DesignError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
