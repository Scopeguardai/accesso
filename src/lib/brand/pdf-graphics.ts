/**
 * Finding logos in a vector PDF. A PDF page is a list of drawn shapes with
 * nothing saying which ones are the logo, so this reads every filled shape,
 * throws away backgrounds, panels and rules, groups the shapes that sit
 * together, and returns each group as a one-colour SVG for a person to pick from.
 * Live text is not a shape, so a wordmark typed in a font is not found.
 */

export type FoundGraphic = { svg: string; page: number; from: string };

type Matrix = [number, number, number, number, number, number];
type Box = [number, number, number, number];
type Shape = { d: string; box: Box; evenOdd: boolean; rect: boolean; fill: string };

const MAX_PAGES = 40;
const MAX_FOUND = 24;
const MAX_SVG_CHARS = 120_000;

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const num = (n: number) => String(Math.round(n * 100) / 100);
const width = (b: Box) => b[2] - b[0];
const height = (b: Box) => b[3] - b[1];
const larger = (b: Box) => Math.max(width(b), height(b));
const inside = (a: Box, b: Box) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[2] <= b[2] + 0.5 && a[3] <= b[3] + 0.5;
const gap = (a: Box, b: Box) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3], 0);

/** One path from the PDF library's packed form, moved into page coordinates. */
function readPath(data: ArrayLike<number>, m: Matrix): { d: string; box: Box; rect: boolean } | null {
  const parts: string[] = [];
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  let lines = 0;
  let curves = 0;
  let subpaths = 0;
  const point = (x: number, y: number) => {
    const [px, py] = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    if (!Number.isFinite(px) || !Number.isFinite(py)) throw new Error('bad point');
    box[0] = Math.min(box[0], px);
    box[1] = Math.min(box[1], py);
    box[2] = Math.max(box[2], px);
    box[3] = Math.max(box[3], py);
    return `${num(px)} ${num(py)}`;
  };
  try {
    for (let i = 0; i < data.length; ) {
      const op = data[i++];
      if (op === 0) {
        parts.push(`M${point(data[i], data[i + 1])}`);
        i += 2;
        subpaths += 1;
      } else if (op === 1) {
        parts.push(`L${point(data[i], data[i + 1])}`);
        i += 2;
        lines += 1;
      } else if (op === 2) {
        parts.push(`C${point(data[i], data[i + 1])} ${point(data[i + 2], data[i + 3])} ${point(data[i + 4], data[i + 5])}`);
        i += 6;
        curves += 1;
      } else if (op === 3) {
        parts.push(`Q${point(data[i], data[i + 1])} ${point(data[i + 2], data[i + 3])}`);
        i += 4;
        curves += 1;
      } else if (op === 4) {
        parts.push('Z');
      } else return null;
    }
  } catch {
    return null;
  }
  if (parts.length < 2 || box[0] === Infinity) return null;
  return { d: parts.join(''), box, rect: subpaths === 1 && curves === 0 && lines <= 4 && isAxisRect(data) };
}

/** True for a plain upright rectangle: every edge runs straight across or straight up. */
function isAxisRect(data: ArrayLike<number>): boolean {
  const pts: [number, number][] = [];
  for (let i = 0; i < data.length; ) {
    const op = data[i++];
    if (op === 0 || op === 1) {
      pts.push([data[i], data[i + 1]]);
      i += 2;
    } else if (op === 4) continue;
    else return false;
  }
  if (pts.length < 4 || pts.length > 5) return false;
  return pts.every((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.abs(p[0] - q[0]) < 0.01 || Math.abs(p[1] - q[1]) < 0.01;
  });
}

function pageShapes(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, flip: Matrix): Shape[] {
  const shapes: Shape[] = [];
  let ctm: Matrix = flip;
  let fill = '#000000';
  const stack: { ctm: Matrix; fill: string }[] = [];
  const fills = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const evenOdd = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke]);
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push({ ctm, fill });
    else if (fn === OPS.restore) {
      const top = stack.pop();
      if (top) ({ ctm, fill } = top);
    } else if (fn === OPS.transform && args) ctm = multiply(ctm, args as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, fill });
      const matrix = args?.[0] as ArrayLike<number> | null;
      if (matrix && matrix.length === 6) ctm = multiply(ctm, Array.from(matrix) as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) {
      const top = stack.pop();
      if (top) ({ ctm, fill } = top);
    } else if (fn === OPS.setFillRGBColor && typeof args?.[0] === 'string') fill = args[0].toLowerCase();
    else if (fn === OPS.setFillTransparent) fill = 'none';
    else if (fn === OPS.constructPath && args && fills.has(args[0] as number) && fill !== 'none') {
      const data = (args[1] as ArrayLike<number>[] | null)?.[0];
      const path = data && data.length <= 60_000 ? readPath(data, ctm) : null;
      if (path) shapes.push({ ...path, evenOdd: evenOdd.has(args[0] as number), fill });
    }
  });
  return shapes;
}

/** Group shapes that sit close together, relative to their own size. */
function clusters(shapes: Shape[]): Shape[][] {
  const parent = shapes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < shapes.length; a += 1) {
    for (let b = a + 1; b < shapes.length; b += 1) {
      const reach = 0.3 * Math.min(larger(shapes[a].box), larger(shapes[b].box));
      if (gap(shapes[a].box, shapes[b].box) <= reach) parent[find(a)] = find(b);
    }
  }
  const groups = new Map<number, Shape[]>();
  shapes.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), s]));
  return [...groups.values()];
}

const unionBox = (group: Shape[]): Box =>
  group.reduce<Box>((b, s) => [Math.min(b[0], s.box[0]), Math.min(b[1], s.box[1]), Math.max(b[2], s.box[2]), Math.max(b[3], s.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);

function toSvg(group: Shape[], box: Box): string {
  const pad = larger(box) * 0.02;
  const view = [box[0] - pad, box[1] - pad, width(box) + pad * 2, height(box) + pad * 2].map(num).join(' ');
  const paths = group.map((s) => `<path d="${s.d}"${s.evenOdd ? ' fill-rule="evenodd"' : ''}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" fill="currentColor">${paths}</svg>`;
}

/** Every group of drawn shapes in the PDF that could be a logo, best guesses first. */
export async function pdfGraphics(bytes: Uint8Array): Promise<FoundGraphic[]> {
  const { getDocumentProxy, getResolvedPDFJS } = await import('unpdf');
  const pdfjs = await getResolvedPDFJS();
  const OPS = pdfjs.OPS as unknown as Record<string, number>;
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const found: (FoundGraphic & { score: number; key: string })[] = [];

  for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n += 1) {
    try {
      const page = await pdf.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const pageArea = view.width * view.height;
      const ops = (await page.getOperatorList()) as unknown as { fnArray: number[]; argsArray: unknown[] };
      if (ops.fnArray.length > 200_000) continue;
      const all = pageShapes(ops, OPS, view.transform as Matrix).filter(
        (s) => s.box[2] > 0 && s.box[3] > 0 && s.box[0] < view.width && s.box[1] < view.height,
      );
      // Backgrounds and panels: anything nearly page-sized, and plain rectangles that hold other shapes.
      const shapes = all.filter((s) => {
        const area = width(s.box) * height(s.box);
        if (area > pageArea * 0.5) return false;
        if (Math.min(width(s.box), height(s.box)) < 1.5) return false;
        if (s.rect && all.some((o) => o !== s && inside(o.box, s.box))) return false;
        return true;
      });
      if (shapes.length === 0 || shapes.length > 1500) continue;
      const text = (await page.getTextContent()).items.map((item) => ('str' in item ? item.str : '')).join(' ').slice(0, 2000);
      const aboutLogo = /\b(logo|logotype|wordmark|symbol|emblem|monogram|brandmark)\b/i.test(text);

      for (const group of clusters(shapes)) {
        const box = unionBox(group);
        const size = larger(box);
        // Too small to be a logo shown for reference, a single plain block (a colour swatch), or a whole illustration.
        if (size < 28 || Math.min(width(box), height(box)) < 8) continue;
        if (group.every((s) => s.rect)) continue;
        if (group.length === 1 && isBlob(group[0])) continue;
        if (group.length > 300) continue;
        const svg = toSvg(group, box);
        if (svg.length > MAX_SVG_CHARS) continue;
        const ratio = Math.round((width(box) / height(box)) * 20) / 20;
        found.push({
          svg,
          page: n,
          from: `page ${n}`,
          key: `${group.length}:${ratio}`,
          score: (aboutLogo ? 1000 : 0) + Math.min(size, 900) / 10 - n,
        });
      }
    } catch {
      /* a page that cannot be read is skipped */
    }
  }

  // The same drawing usually appears many times (colour versions, spacing guides): keep the best of each.
  const best = new Map<string, (typeof found)[number]>();
  for (const f of found.sort((a, b) => b.score - a.score)) if (!best.has(f.key)) best.set(f.key, f);
  return [...best.values()].slice(0, MAX_FOUND).map(({ svg, page, from }) => ({ svg, page, from }));
}

/** A single simple closed curve with few points: a circle or a rounded swatch, not a logo. */
const isBlob = (s: Shape) => (s.d.match(/[MLCQ]/g) ?? []).length <= 6;
