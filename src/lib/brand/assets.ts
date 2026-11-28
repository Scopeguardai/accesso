/**
 * Checks for files uploaded to a brand pack: logos (SVG), fonts and images.
 * Logos are placed straight into slides and pages, so an uploaded SVG is
 * rebuilt from an allowlist of drawing elements and attributes; anything
 * that could run code or load something from elsewhere is dropped.
 */

export class AssetError extends Error {}

/** Limits shared by the page and the server. */
export const MAX_PALETTES = 12;
export const MAX_IMAGES = 40;

const SVG_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'stop',
  'use',
  'title',
  'desc',
]);

const SVG_ATTRIBUTES = new Set([
  'viewbox',
  'xmlns',
  'version',
  'id',
  'class',
  'd',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'points',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-dasharray',
  'clip-rule',
  'clip-path',
  'mask',
  'opacity',
  'transform',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'clippathunits',
  'maskunits',
  'preserveaspectratio',
  'href',
  'xlink:href',
  'xmlns:xlink',
]);

const CAMEL: Record<string, string> = {
  viewbox: 'viewBox',
  clippath: 'clipPath',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  spreadmethod: 'spreadMethod',
  clippathunits: 'clipPathUnits',
  maskunits: 'maskUnits',
  preserveaspectratio: 'preserveAspectRatio',
};

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A value is safe if it links nowhere outside the file and carries no script. */
function safeValue(name: string, value: string): boolean {
  const v = value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
  if (v.includes('javascript:') || v.includes('data:') || v.includes('expression(')) return false;
  if (name === 'href' || name === 'xlink:href') return /^#[\w.-]+$/.test(value.trim());
  const urls = v.match(/url\(([^)]*)\)/g) ?? [];
  return urls.every((u) => /^url\(['"]?#[\w.-]+['"]?\)$/.test(u));
}

/** Simple class rules from a <style> block (".st0{fill:#123456}"), so Illustrator-style files keep their colours. */
function classFills(svg: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  for (const block of svg.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []) {
    const css = block.replace(/<\/?style[^>]*>/gi, '').replace(/<!\[CDATA\[|\]\]>/g, '');
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const props: Record<string, string> = {};
      for (const decl of body.split(';')) {
        const [k, ...rest] = decl.split(':');
        const key = k?.trim().toLowerCase();
        const val = rest.join(':').trim();
        if (key && val && ['fill', 'stroke', 'fill-rule', 'stroke-width', 'opacity', 'fill-opacity'].includes(key)) {
          if (/^(#[0-9a-f]{3,8}|none|currentcolor|[a-z]+|\d*\.?\d+(px)?|evenodd|nonzero)$/i.test(val)) props[key] = val;
        }
      }
      for (const sel of selectors.split(',')) {
        const m = sel.trim().match(/^\.([\w-]+)$/);
        if (m) rules.set(m[1], { ...(rules.get(m[1]) ?? {}), ...props });
      }
    }
  }
  return rules;
}

/**
 * Rebuild an uploaded SVG from safe parts only. The root keeps its viewBox
 * (made from width and height if missing), loses fixed sizes, and takes the
 * text colour wherever the file sets no colour, so the logo follows the slide.
 */
export function sanitizeSvg(input: string, label: string): string {
  if (input.length > 300_000) throw new AssetError('That logo file is too large. Use an SVG under 300 KB.');
  const source = input.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const styles = classFills(source);
  const out: string[] = [];
  const open: string[] = [];
  let skipping: string | null = null;
  let skipDepth = 0;
  let sawRoot = false;
  let inText = false;

  const tokens = source.match(/<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      if (!skipping && inText && token.trim()) out.push(escapeText(token.trim()));
      continue;
    }
    if (token.startsWith('<?') || token.startsWith('<!')) continue;

    const close = token.startsWith('</');
    const selfClosing = token.endsWith('/>');
    const name = (token.match(/^<\/?\s*([\w:.-]+)/)?.[1] ?? '').toLowerCase();
    if (!name) continue;

    if (skipping) {
      if (name === skipping) {
        if (close) skipDepth -= 1;
        else if (!selfClosing) skipDepth += 1;
        if (skipDepth === 0) skipping = null;
      }
      continue;
    }

    if (close) {
      if (open.at(-1) === name) {
        open.pop();
        out.push(`</${CAMEL[name] ?? name}>`);
        inText = false;
      }
      continue;
    }

    // Anything not on the list (script, style, metadata, foreignObject, image,
    // links, animation, editor data) is dropped together with its content.
    if (!SVG_ELEMENTS.has(name)) {
      if (!selfClosing) {
        skipping = name;
        skipDepth = 1;
      }
      continue;
    }
    if (name === 'svg' && !sawRoot) sawRoot = true;
    else if (!sawRoot) continue;

    const attrs: Record<string, string> = {};
    for (const [, rawName, , dq, sq] of token.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const attr = rawName.toLowerCase();
      const value = dq ?? sq ?? '';
      if (attr.startsWith('on') || !SVG_ATTRIBUTES.has(attr) || !safeValue(attr, value)) continue;
      attrs[attr] = value;
    }
    for (const cls of (attrs.class ?? '').split(/\s+/).filter(Boolean)) {
      for (const [k, v] of Object.entries(styles.get(cls) ?? {})) if (!(k in attrs)) attrs[k] = v;
    }
    delete attrs.class;

    const isRoot = name === 'svg' && open.length === 0;
    if (isRoot) {
      if (!attrs.viewbox) {
        const w = parseFloat(attrs.width ?? '');
        const h = parseFloat(attrs.height ?? '');
        if (!(w > 0 && h > 0)) throw new AssetError('The SVG needs a viewBox, or a width and height, so it can be sized.');
        attrs.viewbox = `0 0 ${w} ${h}`;
      }
      delete attrs.width;
      delete attrs.height;
      attrs.xmlns = 'http://www.w3.org/2000/svg';
      if (!attrs.fill) attrs.fill = 'currentColor';
    }

    const attrText = Object.entries(attrs)
      .map(([k, v]) => ` ${CAMEL[k] ?? k}="${escapeAttr(v)}"`)
      .join('');
    const extra = isRoot ? ` role="img" aria-label="${escapeAttr(label)}"` : '';
    const tag = CAMEL[name] ?? name;
    if (selfClosing) {
      out.push(`<${tag}${attrText}${extra}/>`);
    } else {
      out.push(`<${tag}${attrText}${extra}>`);
      open.push(name);
      inText = name === 'title' || name === 'desc';
    }
  }

  while (open.length) out.push(`</${CAMEL[open.pop()!] ?? 'g'}>`);
  const svg = out.join('');
  if (!sawRoot) throw new AssetError('That file is not an SVG logo. Upload an .svg file.');
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line|use)\b/.test(svg)) {
    throw new AssetError('That SVG has no shapes Voila can use. Export the logo as outlined paths and try again.');
  }
  return svg;
}

export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2';

/** Recognise a font file by its first bytes, not its name. */
export function fontFormat(buf: Buffer): FontFormat | null {
  const sig = buf.subarray(0, 4);
  if (sig.equals(Buffer.from([0, 1, 0, 0])) || sig.toString('latin1') === 'true') return 'truetype';
  if (sig.toString('latin1') === 'OTTO') return 'opentype';
  if (sig.toString('latin1') === 'wOFF') return 'woff';
  if (sig.toString('latin1') === 'wOF2') return 'woff2';
  return null;
}

export const FONT_EXT: Record<FontFormat, string> = { truetype: 'ttf', opentype: 'otf', woff: 'woff', woff2: 'woff2' };

/** The CSS format() name for a font file, from its extension. */
export function cssFontFormat(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase();
  return ext === 'otf' ? 'opentype' : ext === 'woff' ? 'woff' : ext === 'woff2' ? 'woff2' : 'truetype';
}

export type ImageInfo = { ext: 'jpg' | 'png' | 'webp'; width: number; height: number };

/** Recognise a JPEG, PNG or WebP by its bytes and read its size. */
export function imageInfo(buf: Buffer): ImageInfo | null {
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { ext: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.length > 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return { ext: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { ext: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { ext: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
  }
  return null;
}

export function orientationOf(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  const r = width / height;
  return r > 1.1 ? 'landscape' : r < 0.9 ? 'portrait' : 'square';
}

/** A short, safe file and id name from free text. */
export function slugify(text: string, fallback: string): string {
  const s = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '');
  return /^[a-z0-9]/.test(s) ? s : fallback;
}
