import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { sanitizeSvg } from './assets';

/**
 * Turns brand guidelines into text the agent can read: a PDF that was uploaded,
 * or a PDF or web page fetched from a public link. Only text leaves this file.
 */

export class SourceError extends Error {}

export type FoundLogo = { svg: string; from: string };

export type SourceText = {
  label: string;
  kind: 'pdf' | 'site';
  text: string;
  pages?: number;
  /** Logos found in the PDF or on the website, already made safe. Offered to the person, never applied by themselves. */
  logos?: FoundLogo[];
};

const MAX_BYTES = 30_000_000;
const MAX_CHARS = 150_000;

const clip = (text: string) =>
  text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[The document continues; the rest was left out.]` : text;

export async function pdfText(bytes: Uint8Array, label: string): Promise<SourceText> {
  if (bytes.length > MAX_BYTES) throw new SourceError('That PDF is too large. Use one under 30 MB.');
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    throw new SourceError('That file is not a PDF. Upload the guidelines as a PDF.');
  }
  let pages: string[];
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch {
    throw new SourceError('That PDF could not be read. It may be damaged or password-protected.');
  }
  const text = pages.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join('\n\n');
  if (pages.join('').replace(/\s/g, '').length < 200) {
    throw new SourceError(
      'That PDF has almost no text in it, so it is probably scanned images. Voila can only read guidelines with real text.',
    );
  }
  // Drawn shapes that could be the logo. Finding none, or failing, never stops the reading.
  let logos: FoundLogo[] = [];
  try {
    const { pdfGraphics } = await import('./pdf-graphics');
    for (const g of await pdfGraphics(bytes)) {
      try {
        logos.push({ svg: sanitizeSvg(g.svg, 'Logo'), from: g.from });
      } catch {
        /* a drawing the safety check rejects is left out */
      }
    }
  } catch {
    logos = [];
  }
  return { label, kind: 'pdf', text: clip(text), pages: pages.length, logos };
}

function isPrivate(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivate(v6.slice(7));
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

/** Only public web addresses: no local machine, no private network, no odd ports. */
export async function checkPublicUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    throw new SourceError('That is not a web address. Paste a link like https://example.com/brand.pdf.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new SourceError('Use an ordinary http or https link.');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new SourceError('Links with a port number are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !net.isIP(host)) throw new SourceError('Use a public web address.');
  let addresses: string[];
  try {
    addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new SourceError('That address could not be found. Check the link.');
  }
  if (addresses.length === 0 || addresses.some(isPrivate)) throw new SourceError('Use a public web address.');
  return url;
}

async function readLimited(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new SourceError('That file is too large. Use guidelines under 30 MB.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
  ndash: '-', mdash: '-', hellip: '...', middot: '·', copy: '(c)', reg: '', trade: '',
};
const entity = (whole: string, name: string) => {
  if (name[0] !== '#') return (name === 'lt' || name === 'gt' ? ' ' : ENTITIES[name.toLowerCase()]) ?? ' ';
  const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  // Angle brackets never come back from an entity, so decoded text cannot turn into markup.
  return code > 31 && code < 0x10ffff && code !== 60 && code !== 62 ? String.fromCodePoint(code) : ' ';
};
const decode = (text: string) => text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, entity).replace(/\s+/g, ' ').trim();

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|header|footer|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, entity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

/** Open a public link, checking the address again on every redirect. */
async function fetchPublic(input: string, maxBytes = MAX_BYTES): Promise<{ url: URL; type: string; bytes: Uint8Array }> {
  let url = await checkPublicUrl(input);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(25_000),
        headers: { 'user-agent': 'Voila brand import', accept: 'application/pdf,text/html;q=0.9,*/*;q=0.5' },
      });
    } catch {
      throw new SourceError('That link could not be opened. Check it, or download the PDF and upload it.');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      // Every redirect is checked again, so a public link cannot bounce to a private address.
      url = await checkPublicUrl(new URL(res.headers.get('location')!, url).toString());
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new SourceError('That link redirects too many times.');
  if (!res.ok) {
    throw new SourceError(
      res.status === 401 || res.status === 403
        ? 'That link needs a sign-in or blocks automatic reading. Upload the guidelines as a PDF instead.'
        : `That link did not open (error ${res.status}). Check it, or upload the PDF.`,
    );
  }
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new SourceError('That file is too large.');
  const bytes = await readLimited(res);
  if (bytes.length > maxBytes) throw new SourceError('That file is too large.');
  return { url, type: res.headers.get('content-type') ?? '', bytes };
}

/* ---------- reading a website's styling ---------- */

const two = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Every colour written in a piece of CSS, as #RRGGBB. Transparent and near-transparent ones are left out. */
export function cssColours(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi)) {
    let h = m[1].toUpperCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    if (h.length === 8 && parseInt(h.slice(6), 16) < 128) continue;
    out.push(`#${h.slice(0, 6)}`);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi)) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha < 0.5) continue;
    out.push(`#${two(+m[1])}${two(+m[2])}${two(+m[3])}`.toUpperCase());
  }
  for (const m of css.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi)) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha < 0.5) continue;
    const [h, sat, l] = [(+m[1] % 360) / 30, +m[2] / 100, +m[3] / 100];
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => 255 * (l - a * Math.max(-1, Math.min((n + h) % 12 - 3, 9 - ((n + h) % 12), 1)));
    out.push(`#${two(f(0))}${two(f(8))}${two(f(4))}`.toUpperCase());
  }
  return out;
}

const GENERIC_FONT =
  /^(inherit|initial|unset|revert|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|emoji|math|-apple-system|blinkmacsystemfont|segoe ui.*|roboto|helvetica.*|arial|noto .*|apple color emoji|liberation .*|menlo|monaco|consolas|courier.*|sfmono-regular|times.*|georgia|var\(.*)$/i;

const cleanFamily = (name: string) => name.trim().replace(/^['"]|['"]$/g, '').replace(/[<>\n\r]/g, '').trim();

type Styling = {
  variables: Map<string, string>;
  colours: Map<string, number>;
  background: Map<string, number>;
  fonts: Map<string, number>;
  headingFonts: Set<string>;
  bodyFonts: Set<string>;
  fontFaces: Set<string>;
};

const bump = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);

function readCss(css: string, into: Styling) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const family = /font-family\s*:\s*([^;]+)/i.exec(m[1]);
    if (family) into.fontFaces.add(cleanFamily(family[1]));
  }
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    const [colour] = cssColours(m[2]);
    if (colour && m[2].trim().length < 40 && into.variables.size < 60) into.variables.set(m[1], colour);
  }
  for (const m of text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().slice(-200);
    for (const d of m[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) {
      const prop = d[1].toLowerCase();
      if (prop.startsWith('--')) continue;
      if (prop === 'font-family' || prop === 'font') {
        const list = prop === 'font' ? (/(?:^|\s)[\d.]+(?:px|rem|em|pt|%|vw)(?:\s*\/\s*[\w.%]+)?\s+(.+)$/i.exec(d[2])?.[1] ?? '') : d[2];
        const family = list.split(',').map(cleanFamily).find((f) => f && !GENERIC_FONT.test(f));
        if (!family || family.length > 60) continue;
        bump(into.fonts, family);
        if (/(^|[\s,>+~])(h[1-3]|\.?(heading|headline|title|display|hero)[\w-]*)\b/i.test(selector)) into.headingFonts.add(family);
        if (/(^|[\s,])(body|html|p|:root)\s*(,|$)/i.test(selector)) into.bodyFonts.add(family);
      } else if (/colou?r|background|border|fill|stroke|shadow/.test(prop)) {
        for (const c of cssColours(d[2])) {
          bump(into.colours, c);
          if (prop.startsWith('background')) bump(into.background, c);
        }
      }
    }
  }
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined) ?? '';

const top = (map: Map<string, number>, n: number) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/** A drawing that only points at a shared sprite (<use href="#id">) is rebuilt from that sprite. */
function inlineSprite(svg: string, html: string): string {
  const ref = /<use\b[^>]*?(?:xlink:)?href\s*=\s*["']#([\w:.-]+)["']/i.exec(svg)?.[1];
  if (!ref || /<(path|polygon|rect|circle|ellipse)\b/i.test(svg)) return svg;
  const symbol = new RegExp(`<symbol\\b[^>]*\\bid\\s*=\\s*["']${ref.replace(/[.]/g, '\\.')}["'][^>]*>([\\s\\S]*?)</symbol>`, 'i').exec(html);
  if (!symbol) return svg;
  const box = attr(symbol[0].slice(0, symbol[0].indexOf('>') + 1), 'viewBox') || attr(svg.slice(0, svg.indexOf('>') + 1), 'viewBox');
  return `<svg xmlns="http://www.w3.org/2000/svg"${box ? ` viewBox="${box}"` : ''}>${symbol[1]}</svg>`;
}

/**
 * Every SVG drawing on the page that could be the logo, likeliest first: the one in the
 * header's home link, anything labelled as a logo, the site icon, then the rest.
 */
async function findLogos(html: string, base: URL): Promise<FoundLogo[]> {
  type Candidate = { rank: number; get: () => Promise<{ svg: string; from: string }> };
  const candidates: Candidate[] = [];
  const header = /<header\b[\s\S]*?<\/header>/i.exec(html);
  const headerEnd = header ? header.index + header[0].length : Math.min(html.length, 60_000);
  const headerStart = header?.index ?? 0;

  for (const m of html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
    if (m[0].length > 400_000) continue;
    const at = m.index ?? 0;
    const before = html.slice(Math.max(0, at - 500), at);
    const link = /<a\b[^>]*>(?![\s\S]*<\/a>)/i.exec(before)?.[0] ?? '';
    const inHeader = at >= headerStart && at < headerEnd;
    const home = link && /^(\/|\.\/?|#)?$/.test(attr(link, 'href').replace(base.origin, ''));
    const labelled = /logo|brand|wordmark/i.test(link + m[0].slice(0, 300));
    const rank = (inHeader && home ? 0 : labelled ? 1 : inHeader ? 3 : 5);
    const svg = inlineSprite(m[0], html);
    candidates.push({ rank, get: async () => ({ svg, from: inHeader ? 'the page header' : 'the page' }) });
  }
  const linked = (src: string, rank: number) => {
    if (!src || !/\.svg(\?|#|$)/i.test(src)) return;
    candidates.push({
      rank,
      get: async () => {
        const file = await fetchPublic(new URL(decode(src), base).toString(), 400_000);
        return { svg: Buffer.from(file.bytes).toString('utf8'), from: file.url.hostname + file.url.pathname };
      },
    });
  };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) linked(attr(m[0], 'src'), /logo|brand|wordmark/i.test(m[0]) ? 1 : 4);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) if (/icon/i.test(attr(m[0], 'rel'))) linked(attr(m[0], 'href'), 2);

  const found: FoundLogo[] = [];
  const seen = new Set<string>();
  let fetched = 0;
  for (const c of candidates.sort((a, b) => a.rank - b.rank).slice(0, 40)) {
    if (found.length >= 16) break;
    try {
      if (c.rank !== 0 && c.rank !== 3 && c.rank !== 5 && (fetched += 1) > 12) continue;
      const got = await c.get();
      if (got.svg.length > 400_000) continue;
      const svg = sanitizeSvg(got.svg, 'Logo');
      // A drawing with almost nothing in it is a tiny icon or an empty sprite reference, not a logo.
      if (!/<(path|polygon|rect|circle|ellipse|polyline|line)\b/.test(svg) || svg.length < 200) continue;
      const key = svg.replace(/\s+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ svg, from: got.from });
    } catch {
      /* try the next candidate */
    }
  }
  return found;
}

/** Read a website as an identity guide: what it says, and the colours, fonts and logo it uses. */
async function siteSource(url: URL, html: string): Promise<SourceText> {
  const styling: Styling = {
    variables: new Map(), colours: new Map(), background: new Map(), fonts: new Map(),
    headingFonts: new Set(), bodyFonts: new Set(), fontFaces: new Set(),
  };
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) readCss(m[1], styling);
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) readCss(`x{${m[1]}}`, styling);

  const sheets: string[] = [];
  const webFonts = new Set<string>();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = decode(attr(m[0], 'href'));
    if (!href || !/stylesheet/i.test(attr(m[0], 'rel'))) continue;
    const google = /fonts\.googleapis\.com\/css2?\?(.*)/i.exec(href);
    if (google) {
      for (const f of google[1].matchAll(/family=([^:&]+)/g)) webFonts.add(cleanFamily(decodeURIComponent(f[1]).replace(/\+/g, ' ')));
    } else sheets.push(href);
  }
  let read = 0;
  await Promise.all(
    sheets.slice(0, 12).map(async (href) => {
      try {
        const sheet = await fetchPublic(new URL(href, url).toString(), 3_000_000);
        readCss(Buffer.from(sheet.bytes).toString('utf8'), styling);
        read += 1;
      } catch {
        /* a stylesheet that cannot be read is skipped */
      }
    }),
  );

  const meta = (name: string) => {
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      if ([attr(m[0], 'name'), attr(m[0], 'property')].some((v) => v.toLowerCase() === name)) return decode(attr(m[0], 'content'));
    }
    return '';
  };
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const headings = [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => htmlToText(m[1]).replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 12);
  const text = htmlToText(html);
  const colours = top(styling.colours, 24);
  if (text.length < 200 && colours.length < 3) {
    throw new SourceError(
      'That page has almost nothing Voila can read. It may be built entirely in the browser. Upload the guidelines as a PDF, or add the details by hand.',
    );
  }

  const lines: string[] = [
    `Website: ${url.hostname}`,
    title && `Page title: ${title}`,
    meta('description') && `Description: ${meta('description')}`,
    meta('og:site_name') && `Site name: ${meta('og:site_name')}`,
    meta('theme-color') && `Browser theme colour: ${meta('theme-color')}`,
    headings.length > 0 && `Main headings: ${headings.join(' | ')}`,
    '',
    `--- Styling (read from the page and ${read} of its ${sheets.length} stylesheets) ---`,
    styling.variables.size > 0 &&
      `Named colours in the styling:\n${[...styling.variables].map(([k, v]) => `  ${k}: ${v}`).join('\n')}`,
    colours.length > 0 &&
      `Colours by how often the styling uses them:\n${colours.map(([c, n]) => `  ${c} used ${n} times${styling.background.has(c) ? `, ${styling.background.get(c)} as a background` : ''}`).join('\n')}`,
    styling.fonts.size > 0 &&
      `Typefaces by how often the styling uses them:\n${top(styling.fonts, 8).map(([f, n]) => `  ${f} used ${n} times${styling.headingFonts.has(f) ? ', on headings' : ''}${styling.bodyFonts.has(f) ? ', on body text' : ''}`).join('\n')}`,
    styling.fontFaces.size > 0 && `Font files the site loads: ${[...styling.fontFaces].slice(0, 12).join(', ')}`,
    webFonts.size > 0 && `Google Fonts the site loads: ${[...webFonts].join(', ')}`,
    '',
    '--- Text of the page ---',
    text,
  ].filter((l): l is string => l !== false && l !== undefined && (l === '' || l.length > 0));

  return {
    label: url.hostname + (url.pathname.length > 1 ? url.pathname : ''),
    kind: 'site',
    text: clip(lines.join('\n')),
    logos: await findLogos(html, url),
  };
}

/** Fetch a link: a guidelines PDF, or a web page that is read as an identity guide. */
export async function urlText(input: string): Promise<SourceText> {
  const { url, type, bytes } = await fetchPublic(input);
  const label = url.hostname + (url.pathname.length > 1 ? url.pathname : '');
  if (type.includes('pdf') || Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-') return pdfText(bytes, label);
  if (!type.includes('html') && !type.startsWith('text/')) {
    throw new SourceError('That link is not a PDF or a web page. Link to the guidelines PDF or the website.');
  }
  return siteSource(url, Buffer.from(bytes).toString('utf8'));
}

/** For the self-test: read a page from its HTML without fetching anything else. */
export const siteFromHtml = (address: string, html: string) => siteSource(new URL(address), html);
