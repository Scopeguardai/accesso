import { NextResponse } from 'next/server';
import { imageInfo, sanitizeSvg } from '@/lib/brand/assets';
import { clearFolderSearch, isSearching, readFolderSearch } from '@/lib/brand/folder-agent';
import { listBrands } from '@/lib/brand/load';
import { addFiles, clearFiles, fontNames, fontWeight, listFiles, readFile, removeFile, SourceFileError } from '@/lib/brand/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const noBrand = () => NextResponse.json({ error: 'That brand no longer exists.' }, { status: 404 });

export type FolderFile = {
  path: string;
  kind: 'logo' | 'font' | 'image' | 'document';
  size: number;
  svg?: string;
  family?: string;
  style?: string;
  weight?: string;
  width?: number;
  height?: number;
};

/** What is in a brand's folder, with what is needed to show and use each file, and the agent's picks. */
function folderView(brand: string) {
  const files: FolderFile[] = listFiles(brand).map((f) => {
    const out: FolderFile = { ...f };
    try {
      if (f.kind === 'logo' && f.size < 300_000) out.svg = sanitizeSvg(readFile(brand, f.path).toString('utf8'), 'Logo');
      if (f.kind === 'font') {
        const buf = readFile(brand, f.path);
        const n = fontNames(buf);
        Object.assign(out, { family: n.family, style: n.style, weight: fontWeight(buf, n.style ?? f.path) });
      }
      if (f.kind === 'image') {
        const info = imageInfo(readFile(brand, f.path));
        if (info) Object.assign(out, { width: info.width, height: info.height });
      }
    } catch {
      /* shown without details */
    }
    return out;
  });
  return { files, search: readFolderSearch(brand) };
}

export async function GET(request: Request) {
  const brand = new URL(request.url).searchParams.get('brand') ?? '';
  return listBrands().includes(brand) ? NextResponse.json(folderView(brand)) : noBrand();
}

/** Add files: a form with brand, then pairs of path (relative to the chosen folder) and file. Zips are unpacked. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const brand = String(form?.get('brand') ?? '');
  if (!form || !listBrands().includes(brand)) return noBrand();
  if (isSearching(brand)) return NextResponse.json({ error: 'Wait for the agent to finish searching the folder.' }, { status: 409 });
  const paths = form.getAll('path').map(String);
  const files = form.getAll('file').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'Choose a folder or some files first.' }, { status: 400 });
  try {
    const incoming = await Promise.all(
      files.map(async (f, i) => ({ path: paths[i] || f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
    );
    const result = await addFiles(brand, incoming);
    return NextResponse.json({ ...result, ...folderView(brand) });
  } catch (err) {
    if (err instanceof SourceFileError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** Remove one file (?path=) or everything (?all=1) from the folder. */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const brand = params.get('brand') ?? '';
  if (!listBrands().includes(brand)) return noBrand();
  if (isSearching(brand)) return NextResponse.json({ error: 'Wait for the agent to finish searching the folder.' }, { status: 409 });
  try {
    if (params.get('all') === '1') {
      clearFiles(brand);
      clearFolderSearch(brand);
    } else removeFile(brand, params.get('path') ?? '');
    return NextResponse.json(folderView(brand));
  } catch (err) {
    if (err instanceof SourceFileError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
