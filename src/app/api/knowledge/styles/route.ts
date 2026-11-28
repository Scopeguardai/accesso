import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { createStyle, deleteStyle, listStyles, StyleError, styleInputSchema, updateStyle } from '@/lib/knowledge/styles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = (request: Request) => {
  const p = new URL(request.url).searchParams;
  const brand = p.get('brand') ?? '';
  return { brand: listBrands().includes(brand) ? brand : null, id: p.get('id') ?? '' };
};
const noBrand = () => NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });

/** A brand's presentation styles. */
export async function GET(request: Request) {
  const { brand } = params(request);
  return brand ? NextResponse.json(listStyles(brand)) : noBrand();
}

/** Add a style, or with ?id= change one. */
async function save(request: Request) {
  const { brand, id } = params(request);
  if (!brand) return noBrand();
  const parsed = styleInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the style and try again.' }, { status: 400 });
  try {
    const style = id ? updateStyle(brand, id, parsed.data) : createStyle(brand, parsed.data);
    return NextResponse.json({ style, styles: listStyles(brand) }, { status: id ? 200 : 201 });
  } catch (err) {
    if (err instanceof StyleError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
export const POST = save;
export const PUT = save;

export async function DELETE(request: Request) {
  const { brand, id } = params(request);
  if (!brand) return noBrand();
  try {
    deleteStyle(brand, id);
    return NextResponse.json({ styles: listStyles(brand) });
  } catch (err) {
    if (err instanceof StyleError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
