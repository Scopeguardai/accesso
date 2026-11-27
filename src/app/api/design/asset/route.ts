import { NextResponse } from 'next/server';
import { AssetError } from '@/lib/brand/assets';
import { addImage, DesignError, removeImage, replaceFont, replaceLogo } from '@/lib/brand/design';
import { listBrands } from '@/lib/brand/load';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['wordmark', 'mark', 'font-sans', 'font-mono', 'image'] as const;
type Kind = (typeof KINDS)[number];

function fail(err: unknown) {
  if (err instanceof AssetError || err instanceof DesignError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  throw err;
}

/** Upload a logo, a font or an image: a form with brand, kind and file, plus the notes each kind needs. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  const brand = String(form.get('brand') ?? '');
  const kind = String(form.get('kind') ?? '') as Kind;
  const file = form.get('file');
  if (!listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unknown upload.' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    if (kind === 'wordmark' || kind === 'mark') return NextResponse.json(replaceLogo(brand, kind, buf.toString('utf8')));
    if (kind === 'font-sans' || kind === 'font-mono') {
      const role = kind === 'font-sans' ? 'sans' : 'mono';
      return NextResponse.json(
        replaceFont(brand, role, buf, String(form.get('family') ?? ''), String(form.get('weight') ?? '400')),
      );
    }
    return NextResponse.json(addImage(brand, buf, String(form.get('alt') ?? ''), String(form.get('use') ?? '')));
  } catch (err) {
    return fail(err);
  }
}

/** Remove an image: ?brand=<id>&image=<image id>. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const brand = url.searchParams.get('brand') ?? '';
  const image = url.searchParams.get('image') ?? '';
  if (!listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  try {
    return NextResponse.json(removeImage(brand, image));
  } catch (err) {
    return fail(err);
  }
}
