import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/brand/load';
import { ExampleError, listExamples, saveExample } from '@/lib/knowledge/examples';
import { isDrafting } from '@/lib/knowledge/style-agent';
import { ROOT } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * An example presentation arrives in pieces of 8 MB, because the connection to a
 * codespace refuses larger requests. The last piece puts the file together.
 */

const TMP = path.join(ROOT, 'data', 'uploads-tmp');

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const brand = String(form?.get('brand') ?? '');
  if (!form || !listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  if (isDrafting(brand)) return NextResponse.json({ error: 'Wait for the agent to finish studying the examples.' }, { status: 409 });
  const upload = String(form.get('upload') ?? '');
  const index = Number(form.get('index'));
  const count = Number(form.get('count'));
  const name = String(form.get('name') ?? '').slice(0, 200);
  const piece = form.get('piece');
  if (!/^[a-z0-9]{8,32}$/.test(upload) || !Number.isInteger(index) || !Number.isInteger(count) || count < 1 || count > 12 || index < 0 || index >= count || !(piece instanceof File)) {
    return NextResponse.json({ error: 'The upload was interrupted. Try again.' }, { status: 400 });
  }
  const dir = path.join(TMP, brand);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `ex-${upload}.${index}`), Buffer.from(await piece.arrayBuffer()));
  if (index < count - 1) return NextResponse.json({ received: index + 1 });

  const parts = Array.from({ length: count }, (_, i) => path.join(dir, `ex-${upload}.${i}`));
  try {
    if (!parts.every((p) => fs.existsSync(p))) return NextResponse.json({ error: 'Part of the file went missing on the way. Try again.' }, { status: 400 });
    saveExample(brand, name, Buffer.concat(parts.map((p) => fs.readFileSync(p))));
    return NextResponse.json({ examples: listExamples(brand) });
  } catch (err) {
    if (err instanceof ExampleError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  } finally {
    for (const p of parts) fs.rmSync(p, { force: true });
  }
}
