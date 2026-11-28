import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { clearExamples, ExampleError, listExamples, removeExample } from '@/lib/knowledge/examples';
import { clearStyleDraft, isDrafting, readStyleDraft } from '@/lib/knowledge/style-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const view = (brand: string) => ({ examples: listExamples(brand), draft: readStyleDraft(brand) });
const noBrand = () => NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });

/** The example presentations uploaded for a brand, and the style the agent drafted from them. */
export async function GET(request: Request) {
  const brand = new URL(request.url).searchParams.get('brand') ?? '';
  return listBrands().includes(brand) ? NextResponse.json(view(brand)) : noBrand();
}

/** Remove one example (?file=), or with ?all=1 the examples and the draft. */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const brand = params.get('brand') ?? '';
  if (!listBrands().includes(brand)) return noBrand();
  if (isDrafting(brand)) return NextResponse.json({ error: 'Wait for the agent to finish studying the examples.' }, { status: 409 });
  try {
    if (params.get('all') === '1') {
      clearExamples(brand);
      clearStyleDraft(brand);
    } else removeExample(brand, params.get('file') ?? '');
    return NextResponse.json(view(brand));
  } catch (err) {
    if (err instanceof ExampleError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
