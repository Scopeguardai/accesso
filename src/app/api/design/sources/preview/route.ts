import { listBrands } from '@/lib/brand/load';
import { kindOf, previewImage } from '@/lib/brand/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A small JPEG of a photo or logo in the brand folder. Always a JPEG, so nothing in it can run. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const brand = params.get('brand') ?? '';
  const file = params.get('path') ?? '';
  const size = Math.min(1200, Math.max(120, Number(params.get('size')) || 360));
  const kind = kindOf(file);
  if (!listBrands().includes(brand) || (kind !== 'image' && kind !== 'logo')) return new Response('Not found', { status: 404 });
  try {
    const jpeg = await previewImage(brand, file, size);
    return new Response(new Uint8Array(jpeg), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
