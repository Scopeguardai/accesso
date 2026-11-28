import { cleanPath, ext, kindOf, MAX_FILE, UNUSABLE } from '@/lib/brand/source-types';

export type Skipped = { path: string; reason: string };

/**
 * The connection to a codespace refuses any single request over about 16 MB, so
 * files go in batches well under that, and any file larger than a batch goes in
 * pieces that the server puts back together.
 */
const BATCH_BYTES = 12_000_000;
const BATCH_FILES = 80;
const PIECE_BYTES = 8_000_000;
const MAX_ZIP = 65_000_000;

/** Read a response, turning a refusal by something in between (an HTML error page) into a clear message. */
async function reply(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  if (res.ok && body) return body;
  if (body?.error) throw new Error(body.error);
  if (res.status === 413) throw new Error('That was too large to send. Try fewer files at a time.');
  if (res.status === 401) throw new Error('You have been signed out. Sign in again and retry.');
  if (res.status >= 500) throw new Error(`${fallback} (the app reported an error, ${res.status}). Try again.`);
  throw new Error(`${fallback} (error ${res.status}). Try again.`);
}

const uploadId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');

/** Send one large file in pieces. */
async function sendInPieces(brand: string, rel: string, file: File) {
  const count = Math.ceil(file.size / PIECE_BYTES);
  const id = uploadId();
  let body: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    const form = new FormData();
    form.set('brand', brand);
    form.set('upload', id);
    form.set('index', String(i));
    form.set('count', String(count));
    form.set('path', rel);
    form.set('piece', file.slice(i * PIECE_BYTES, (i + 1) * PIECE_BYTES), 'piece');
    body = await reply(await fetch('/api/design/sources/chunk', { method: 'POST', body: form }), `${rel} could not be sent`);
  }
  return body;
}

/**
 * Send a chosen folder (or loose files and zips) to a brand's folder, skipping in
 * the browser what would be refused anyway, so large Illustrator or video files
 * are never uploaded. Returns what the server skipped as well.
 */
export async function uploadToFolder(
  brand: string,
  list: FileList | File[],
  onProgress: (sent: number, total: number) => void,
): Promise<{ added: number; skipped: Skipped[]; data: unknown; paths: string[] }> {
  const skipped: Skipped[] = [];
  const keep: { path: string; file: File }[] = [];
  for (const file of Array.from(list)) {
    const rel = cleanPath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
    if (!rel) continue;
    const e = ext(rel);
    if (!kindOf(rel) && e !== 'zip') {
      if (UNUSABLE[e]) skipped.push({ path: rel, reason: UNUSABLE[e] });
      continue;
    }
    if (file.size > (e === 'zip' ? MAX_ZIP : MAX_FILE)) {
      skipped.push({
        path: rel,
        reason: e === 'zip' ? 'This zip is too large (over 65 MB). Unzip it and choose the folder instead.' : 'Too large (over 60 MB).',
      });
      continue;
    }
    keep.push({ path: rel, file });
  }

  let added = 0;
  let sent = 0;
  let data: unknown = null;
  const paths: string[] = [];
  const take = (body: Record<string, unknown>) => {
    const got = (body.added as string[] | undefined) ?? [];
    added += got.length;
    paths.push(...got);
    skipped.push(...((body.skipped as Skipped[] | undefined) ?? []));
    data = body;
  };
  onProgress(0, keep.length);

  const large = keep.filter((k) => k.file.size > BATCH_BYTES);
  const small = keep.filter((k) => k.file.size <= BATCH_BYTES);
  for (let i = 0; i < small.length; ) {
    const form = new FormData();
    form.set('brand', brand);
    let bytes = 0;
    let n = 0;
    while (i < small.length && n < BATCH_FILES && (n === 0 || bytes + small[i].file.size <= BATCH_BYTES)) {
      form.append('path', small[i].path);
      form.append('file', small[i].file);
      bytes += small[i].file.size;
      n += 1;
      i += 1;
    }
    take(await reply(await fetch('/api/design/sources', { method: 'POST', body: form }), 'The files could not be added'));
    sent += n;
    onProgress(sent, keep.length);
  }
  for (const k of large) {
    take(await sendInPieces(brand, k.path, k.file));
    sent += 1;
    onProgress(sent, keep.length);
  }
  return { added, skipped, data, paths };
}

/**
 * Start reading guidelines: a link, or a PDF. A PDF too large for one request goes
 * to the brand folder in pieces first and is read from there.
 */
export async function sendGuidelines(brand: string, fields: { file?: File; url?: string }) {
  const form = new FormData();
  form.set('brand', brand);
  if (fields.file && fields.file.size > BATCH_BYTES) {
    const { paths, skipped } = await uploadToFolder(brand, [fields.file], () => {});
    if (!paths[0]) throw new Error(skipped[0]?.reason ?? 'That PDF could not be added.');
    form.set('folderFile', paths[0]);
  } else if (fields.file) form.set('file', fields.file);
  if (fields.url) form.set('url', fields.url);
  return reply(await fetch('/api/design/import', { method: 'POST', body: form }), 'The guidelines could not be read');
}
