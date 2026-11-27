import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { DesignError, designData, designInputSchema, saveDesign } from '@/lib/brand/design';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ?brand=<id>; the brand must be one of the brand packs. */
function brandOf(request: Request): string | null {
  const brand = new URL(request.url).searchParams.get('brand') ?? '';
  return listBrands().includes(brand) ? brand : null;
}

const notFound = () => NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });

export async function GET(request: Request) {
  const brand = brandOf(request);
  return brand ? NextResponse.json(designData(brand)) : notFound();
}

export async function PUT(request: Request) {
  const brand = brandOf(request);
  if (!brand) return notFound();
  const parsed = designInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the changes and try again.' }, { status: 400 });
  }
  try {
    return NextResponse.json(saveDesign(brand, parsed.data));
  } catch (err) {
    if (err instanceof DesignError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
