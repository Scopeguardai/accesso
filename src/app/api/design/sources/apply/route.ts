import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AssetError } from '@/lib/brand/assets';
import { addImage, designData, DesignError, replaceFont, replaceLogo } from '@/lib/brand/design';
import { listBrands } from '@/lib/brand/load';
import { fontNames, fontWeight, kindOf, libraryImage, readFile, SourceFileError } from '@/lib/brand/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.discriminatedUnion('as', [
  z.object({ brand: z.string(), as: z.enum(['wordmark', 'mark']), path: z.string() }),
  z.object({
    brand: z.string(),
    as: z.enum(['font-sans', 'font-mono']),
    path: z.string(),
    family: z.string().optional(),
    weight: z.string().optional(),
  }),
  z.object({
    brand: z.string(),
    as: z.literal('images'),
    items: z.array(z.object({ path: z.string(), alt: z.string(), use: z.string() })).min(1).max(40),
  }),
]);

const short = (p: string) => p.split('/').pop() ?? p;

/** Use a file from the brand folder as the wordmark, the symbol, a font, or images for the library. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
  const body = parsed.data;
  if (!listBrands().includes(body.brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  try {
    if (body.as === 'wordmark' || body.as === 'mark') {
      if (kindOf(body.path) !== 'logo') throw new AssetError('Only SVG files can be used as the logo.');
      return NextResponse.json({ design: replaceLogo(body.brand, body.as, readFile(body.brand, body.path).toString('utf8')) });
    }
    if (body.as === 'font-sans' || body.as === 'font-mono') {
      if (kindOf(body.path) !== 'font') throw new AssetError('That is not a font file.');
      const buf = readFile(body.brand, body.path);
      const names = fontNames(buf);
      const family = (body.family || names.family || short(body.path).replace(/[-_ ]?(regular|variable|vf)?\.\w+$/i, '')).trim();
      const weight = body.weight || fontWeight(buf, names.style ?? body.path);
      return NextResponse.json({ design: replaceFont(body.brand, body.as === 'font-sans' ? 'sans' : 'mono', buf, family, weight) });
    }
    if (body.as !== 'images') throw new AssetError('Check the details and try again.');
    const problems: string[] = [];
    let added = 0;
    for (const item of body.items) {
      try {
        if (kindOf(item.path) !== 'image') throw new AssetError('not a photo');
        addImage(body.brand, await libraryImage(body.brand, item.path), item.alt || short(item.path), item.use || 'Chosen from the brand folder.');
        added += 1;
      } catch (err) {
        problems.push(`${short(item.path)}: ${err instanceof AssetError || err instanceof SourceFileError ? err.message : 'could not be added.'}`);
        if (err instanceof AssetError && /holds up to/.test(err.message)) break;
      }
    }
    return NextResponse.json({ design: designData(body.brand), added, problems });
  } catch (err) {
    if (err instanceof AssetError || err instanceof DesignError || err instanceof SourceFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
