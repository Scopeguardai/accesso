/**
 * Which files a brand folder keeps, shared by the browser (to skip files before
 * uploading them) and the server (which checks again).
 */

export type SourceKind = 'logo' | 'font' | 'image' | 'document';

export const KINDS: Record<string, SourceKind> = {
  svg: 'logo',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  pdf: 'document',
  docx: 'document',
  pptx: 'document',
  md: 'document',
  txt: 'document',
};

/** Files that are often in brand folders but cannot be used, with what to do instead. */
export const UNUSABLE: Record<string, string> = {
  ai: 'Illustrator files cannot be read. Export the logo as SVG.',
  eps: 'EPS files cannot be read. Export the logo as SVG.',
  psd: 'Photoshop files cannot be read. Export as JPG or PNG.',
  indd: 'InDesign files cannot be read. Export the guidelines as PDF.',
  sketch: 'Sketch files cannot be read. Export as SVG or PDF.',
  fig: 'Figma files cannot be read. Export as SVG or PDF.',
  heic: 'HEIC photos cannot be used. Export as JPG.',
  tif: 'TIFF images cannot be used. Export as JPG or PNG.',
  tiff: 'TIFF images cannot be used. Export as JPG or PNG.',
  gif: 'GIF images cannot be used. Export as PNG.',
  doc: 'Old Word files cannot be read. Save as .docx or PDF.',
  ppt: 'Old PowerPoint files cannot be read. Save as .pptx or PDF.',
  key: 'Keynote files cannot be read. Export as PDF.',
};

export const MAX_FILE = 60_000_000;

export const ext = (p: string) => (p.includes('.') ? (p.split('.').pop() ?? '').toLowerCase() : '');
export const kindOf = (p: string): SourceKind | null => KINDS[ext(p)] ?? null;

/** A tidy relative path inside the folder, or null for anything odd, hidden or outside it. */
export function cleanPath(input: string): string | null {
  const parts = input.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (parts.length === 0 || parts.length > 12) return null;
  for (const p of parts) {
    if (p === '..' || p.startsWith('.') || p === '__MACOSX' || p.length > 120) return null;
    if (/[\u0000-\u001f<>:"|?*]/.test(p)) return null;
  }
  if (/^(thumbs\.db|desktop\.ini|icon\r?)$/i.test(parts[parts.length - 1])) return null;
  return parts.join('/');
}
