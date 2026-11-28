import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { isSearching } from '@/lib/brand/folder-agent';
import { folderView } from '@/lib/brand/folder-view';
import { listBrands } from '@/lib/brand/load';
import { addFiles, SourceFileError } from '@/lib/brand/sources';
import { ROOT } from '@/lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Large files arrive in pieces, because the connection to a codespace refuses any
 * single request over about 16 MB. Pieces wait in data/uploads-tmp until the last
 * one arrives; then the file is put together and added like any other.
 */

const TMP = path.join(ROOT, 'data', 'uploads-tmp');
const MAX_PIECES = 12;
const MAX_TOTAL = 66_000_000;

function sweep() {
  // Pieces of uploads that were abandoned more than a day ago.
  try {
    for (const brand of fs.readdirSync(TMP)) {
      for (const f of fs.readdirSync(path.join(TMP, brand))) {
        const full = path.join(TMP, brand, f);
        if (Date.now() - fs.statSync(full).mtimeMs > 86_400_000) fs.rmSync(full, { force: true });
      }
    }
  } catch {
    /* nothing to tidy */
  }
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const brand = String(form?.get('brand') ?? '');
  if (!form || !listBrands().includes(brand)) return NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });
  if (isSearching(brand)) return NextResponse.json({ error: 'Wait for the agent to finish searching the folder.' }, { status: 409 });
  const upload = String(form.get('upload') ?? '');
  const index = Number(form.get('index'));
  const count = Number(form.get('count'));
  const rel = String(form.get('path') ?? '');
  const piece = form.get('piece');
  if (
    !/^[a-z0-9]{8,32}$/.test(upload) ||
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_PIECES ||
    index < 0 ||
    index >= count ||
    !(piece instanceof File)
  ) {
    return NextResponse.json({ error: 'The upload was interrupted. Try again.' }, { status: 400 });
  }
  sweep();
  const dir = path.join(TMP, brand);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${upload}.${index}`), Buffer.from(await piece.arrayBuffer()));
  if (index < count - 1) return NextResponse.json({ received: index + 1 });

  const parts = Array.from({ length: count }, (_, i) => path.join(dir, `${upload}.${i}`));
  try {
    if (!parts.every((p) => fs.existsSync(p))) {
      return NextResponse.json({ error: 'Part of the file went missing on the way. Try again.' }, { status: 400 });
    }
    const total = parts.reduce((n, p) => n + fs.statSync(p).size, 0);
    if (total > MAX_TOTAL) return NextResponse.json({ error: 'That file is too large (over 65 MB).' }, { status: 400 });
    const bytes = Buffer.concat(parts.map((p) => fs.readFileSync(p)));
    const result = await addFiles(brand, [{ path: rel, bytes }]);
    return NextResponse.json({ ...result, ...folderView(brand) });
  } catch (err) {
    if (err instanceof SourceFileError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  } finally {
    for (const p of parts) fs.rmSync(p, { force: true });
  }
}
