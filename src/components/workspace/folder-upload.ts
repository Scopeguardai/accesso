import { cleanPath, ext, kindOf, MAX_FILE, UNUSABLE } from '@/lib/brand/source-types';

export type Skipped = { path: string; reason: string };

const BATCH_BYTES = 40_000_000;
const BATCH_FILES = 120;

/**
 * Send a chosen folder (or loose files and zips) to a brand's folder in batches,
 * skipping in the browser what would be refused anyway, so large Illustrator or
 * video files are never uploaded. Returns what the server skipped as well.
 */
export async function uploadToFolder(
  brand: string,
  list: FileList | File[],
  onProgress: (sent: number, total: number) => void,
): Promise<{ added: number; skipped: Skipped[]; data: unknown }> {
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
    if (file.size > MAX_FILE && e !== 'zip') {
      skipped.push({ path: rel, reason: 'Too large (over 60 MB).' });
      continue;
    }
    if (file.size > 65_000_000) {
      skipped.push({ path: rel, reason: 'This zip is too large to send in one go (over 65 MB). Choose the folder instead.' });
      continue;
    }
    keep.push({ path: rel, file });
  }

  let added = 0;
  let sent = 0;
  let data: unknown = null;
  onProgress(0, keep.length);
  for (let i = 0; i < keep.length; ) {
    const form = new FormData();
    form.set('brand', brand);
    let bytes = 0;
    let n = 0;
    while (i < keep.length && n < BATCH_FILES && (n === 0 || bytes + keep[i].file.size <= BATCH_BYTES)) {
      form.append('path', keep[i].path);
      form.append('file', keep[i].file);
      bytes += keep[i].file.size;
      n += 1;
      i += 1;
    }
    const res = await fetch('/api/design/sources', { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'The files could not be added. Try again.');
    added += body.added?.length ?? 0;
    skipped.push(...(body.skipped ?? []));
    data = body;
    sent += n;
    onProgress(sent, keep.length);
  }
  return { added, skipped, data };
}
