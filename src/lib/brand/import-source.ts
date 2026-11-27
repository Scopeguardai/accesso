import { lookup } from 'node:dns/promises';
import net from 'node:net';

/**
 * Turns brand guidelines into text the agent can read: a PDF that was uploaded,
 * or a PDF or web page fetched from a public link. Only text leaves this file.
 */

export class SourceError extends Error {}

export type SourceText = { label: string; kind: 'pdf' | 'page'; text: string; pages?: number };

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
      'That PDF has almost no text in it, so it is probably scanned images. Accesso can only read guidelines with real text.',
    );
  }
  return { label, kind: 'pdf', text: clip(text), pages: pages.length };
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

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|header|footer|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

/** Fetch guidelines from a link: a PDF, or a web page whose text is used. */
export async function urlText(input: string): Promise<SourceText> {
  let url = await checkPublicUrl(input);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(25_000),
        headers: { 'user-agent': 'Accesso brand import', accept: 'application/pdf,text/html;q=0.9,*/*;q=0.5' },
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
        ? 'That link needs a sign-in. Download the guidelines and upload the PDF.'
        : `That link did not open (error ${res.status}). Check it, or upload the PDF.`,
    );
  }
  const bytes = await readLimited(res);
  const type = res.headers.get('content-type') ?? '';
  const label = url.hostname + (url.pathname.length > 1 ? url.pathname : '');
  if (type.includes('pdf') || Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-') return pdfText(bytes, label);
  if (!type.includes('html') && !type.startsWith('text/')) {
    throw new SourceError('That link is not a PDF or a web page. Link to the guidelines PDF, or upload it.');
  }
  const text = htmlToText(Buffer.from(bytes).toString('utf8'));
  if (text.length < 200) {
    throw new SourceError('That page has almost no text Accesso can read. Download the guidelines and upload the PDF.');
  }
  return { label, kind: 'page', text: clip(text) };
}
