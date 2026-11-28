import { NextResponse } from 'next/server';
import { AssetError } from '@/lib/brand/assets';
import { traceLogo } from '@/lib/brand/trace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Turn a logo picture (PNG, JPG or WebP) into SVG: once in its own colours and once
 * in a single colour. Nothing is saved; the page shows both for a person to choose.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a PNG or JPG of the logo.' }, { status: 400 });
  try {
    return NextResponse.json(await traceLogo(Buffer.from(await file.arrayBuffer())));
  } catch (err) {
    if (err instanceof AssetError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'That picture could not be traced. Try a PNG export of the logo.' }, { status: 400 });
  }
}
