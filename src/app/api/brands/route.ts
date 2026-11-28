import { NextResponse } from 'next/server';
import { BrandError, createBrand, newBrandSchema } from '@/lib/brand/create';
import { deleteBrand, RemoveError } from '@/lib/brand/remove';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Create a brand with starter assets. Returns its id. */
export async function POST(request: Request) {
  const parsed = newBrandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ id: createBrand(parsed.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof BrandError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** Delete a brand: it moves to the recycle folder with its files, knowledge base and presentations. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  try {
    return NextResponse.json(deleteBrand(id));
  } catch (err) {
    if (err instanceof RemoveError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
