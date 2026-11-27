import { after, NextResponse } from 'next/server';
import { beginImport, clearImport, isImporting, readImport, runImport } from '@/lib/brand/import';
import { pdfText, SourceError, urlText } from '@/lib/brand/import-source';
import { listBrands } from '@/lib/brand/load';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const noBrand = () => NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
const brandParam = (request: Request) => new URL(request.url).searchParams.get('brand') ?? '';

/** Where reading the guidelines has got to: none, working, error, or ready with a proposal. */
export async function GET(request: Request) {
  const brand = brandParam(request);
  return listBrands().includes(brand) ? NextResponse.json(readImport(brand)) : noBrand();
}

/** Start reading guidelines: a form with brand and either file (a PDF) or url. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const brand = String(form?.get('brand') ?? '');
  if (!form || !listBrands().includes(brand)) return noBrand();
  if (isImporting(brand)) {
    return NextResponse.json({ error: 'Guidelines are already being read for this brand.' }, { status: 409 });
  }
  const file = form.get('file');
  const url = String(form.get('url') ?? '').trim();
  try {
    const source =
      file instanceof File && file.size > 0
        ? await pdfText(new Uint8Array(await file.arrayBuffer()), file.name.slice(0, 120))
        : url
          ? await urlText(url)
          : null;
    if (!source) return NextResponse.json({ error: 'Upload a PDF or paste a link first.' }, { status: 400 });
    if (!beginImport(brand, source)) {
      return NextResponse.json({ error: 'Guidelines are already being read for this brand.' }, { status: 409 });
    }
    after(() => runImport(brand, source));
    return NextResponse.json(readImport(brand), { status: 202 });
  } catch (err) {
    if (err instanceof SourceError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** Dismiss the proposal or the error. */
export async function DELETE(request: Request) {
  const brand = brandParam(request);
  if (!listBrands().includes(brand)) return noBrand();
  if (isImporting(brand)) return NextResponse.json({ error: 'Wait for the reading to finish first.' }, { status: 409 });
  clearImport(brand);
  return NextResponse.json({ status: 'none' });
}
