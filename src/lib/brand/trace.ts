import { AssetError, imageInfo, sanitizeSvg } from './assets';

/**
 * Turning a logo picture (PNG, JPG or WebP) into SVG. The picture's flat colours
 * are found, each colour's shape is traced into smooth outlines, and two logos
 * come back: one in the picture's own colours and one in a single colour that
 * takes its colour from the slide. Works for flat logos; photographs, gradients
 * and fine textures come out flattened.
 */

export type TracedLogo = {
  /** The logo in its own colours. */
  colour: string;
  /** The logo as one shape that takes the colour of the text around it. */
  mono: string;
  /** The colours found, most used first. */
  colours: string[];
  /** Things a person should know about the result. */
  notes: string[];
};

const WORK = 1600; // longest side the picture is traced at
const MAX_COLOURS = 6;

type Cluster = { r: number; g: number; b: number; n: number };

const hex = (c: Cluster) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const dist = (a: { r: number; g: number; b: number }, r: number, g: number, b: number) =>
  Math.sqrt((a.r - r) ** 2 + (a.g - g) ** 2 + (a.b - b) ** 2);

/** Trace one black-on-white mask into an SVG path. */
async function tracePath(mask: Buffer, width: number, height: number): Promise<string> {
  const sharp = (await import('sharp')).default;
  const png = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const { Potrace } = await import('potrace');
  return new Promise((resolve, reject) => {
    const tracer = new Potrace({ threshold: 128, turdSize: 12, optTolerance: 0.4, alphaMax: 1 });
    tracer.loadImage(png, (err: Error | null) => {
      if (err) return reject(err);
      const tag = tracer.getPathTag('#000');
      resolve(/\sd="([^"]*)"/.exec(tag)?.[1] ?? '');
    });
  });
}

export async function traceLogo(input: Buffer): Promise<TracedLogo> {
  if (input.length > 20_000_000) throw new AssetError('That picture is too large. Use one under 20 MB.');
  if (!imageInfo(input)) throw new AssetError('That file is not a PNG, JPG or WebP picture.');
  const sharp = (await import('sharp')).default;
  const notes: string[] = [];

  const meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longest < 32) throw new AssetError('That picture is too small to trace.');
  if (longest < 300) notes.push('The picture is small, so the edges may look rough. A larger PNG gives a cleaner logo.');

  const { data, info } = await sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(WORK, WORK, { fit: 'inside', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const total = width * height;

  // What is background: the transparent part, or failing that the colour around the edge.
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) transparent += 1;
  const hasAlpha = transparent > total * 0.02;
  let bg: { r: number; g: number; b: number } | null = null;
  if (!hasAlpha) {
    const edge = new Map<number, number>();
    const add = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      edge.set(key, (edge.get(key) ?? 0) + 1);
    };
    for (let x = 0; x < width; x += 1) {
      add(x, 0);
      add(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      add(0, y);
      add(width - 1, y);
    }
    const [key, count] = [...edge.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count < (width + height) * 2 * 0.6) {
      throw new AssetError(
        'This picture has no plain background, so the logo cannot be told apart from it. Use a logo on a transparent or single-colour background.',
      );
    }
    bg = { r: ((key >> 10) << 3) + 4, g: (((key >> 5) & 31) << 3) + 4, b: ((key & 31) << 3) + 4 };
    notes.push(
      `The ${dist(bg, 255, 255, 255) < 20 ? 'white' : 'plain'} background was removed. Any part of the logo in that same colour is now see-through.`,
    );
  }

  // Which flat colours the logo comes in. Only pixels inside an area of even colour are counted:
  // the soft pixels along every edge are blends, and would otherwise look like extra colours.
  const at = (x: number, y: number) => (y * width + x) * 4;
  const far = (i: number) => (hasAlpha ? data[i + 3] >= 128 : dist(bg!, data[i], data[i + 1], data[i + 2]) >= 48);
  const buckets = new Map<number, Cluster>();
  let flat = 0;
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = at(x, y);
      if (!far(i)) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      let even = true;
      for (const j of [at(x - 2, y), at(x + 2, y), at(x, y - 2), at(x, y + 2)]) {
        if (!far(j) || Math.abs(data[j] - r) + Math.abs(data[j + 1] - g) + Math.abs(data[j + 2] - b) > 36) {
          even = false;
          break;
        }
      }
      if (!even) continue;
      flat += 1;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const c = buckets.get(key);
      if (c) {
        c.r += r;
        c.g += g;
        c.b += b;
        c.n += 1;
      } else buckets.set(key, { r, g, b, n: 1 });
    }
  }
  if (flat < total * 0.001) throw new AssetError('Nothing to trace was found in that picture.');

  // Merge nearby shades into a few flat colours, most used first.
  const clusters: Cluster[] = [];
  for (const b of [...buckets.values()].sort((a, c) => c.n - a.n)) {
    const [r, g, bl] = [b.r / b.n, b.g / b.n, b.b / b.n];
    const near = clusters.find((c) => dist({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }, r, g, bl) < 56);
    if (near) {
      near.r += b.r;
      near.g += b.g;
      near.b += b.b;
      near.n += b.n;
    } else clusters.push({ ...b });
  }
  const mean = (c: Cluster) => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n, n: c.n });
  const significant = clusters.filter((c) => c.n > flat * 0.012).map(mean);
  if (significant.length === 0) significant.push(mean(clusters[0]));
  const covered = significant.reduce((n, c) => n + c.n, 0) / flat;
  if (significant.length > MAX_COLOURS || covered < 0.85) {
    notes.push('This picture has gradients, shading or many colours. They were flattened into a few flat colours, so check the result carefully.');
  }
  const kept = significant.sort((a, b) => b.n - a.n).slice(0, MAX_COLOURS);

  // One mask per colour (0 = this colour), and one for the whole logo. A soft edge pixel on a
  // plain background is a blend of the background and one logo colour: it goes to the colour
  // whose blend it sits closest to, and counts as logo once it is more logo than background.
  const whole = Buffer.alloc(total, 255);
  const masks = kept.map(() => Buffer.alloc(total, 255));
  let content = 0;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    let best = -1;
    let bestD = Infinity;
    if (hasAlpha) {
      if (data[i + 3] < 128) continue;
      for (let k = 0; k < kept.length; k += 1) {
        const d = dist(kept[k], r, g, b);
        if (d < bestD) [best, bestD] = [k, d];
      }
    } else {
      let bestT = 0;
      for (let k = 0; k < kept.length; k += 1) {
        const [vr, vg, vb] = [kept[k].r - bg!.r, kept[k].g - bg!.g, kept[k].b - bg!.b];
        const t = Math.max(0, Math.min(1, ((r - bg!.r) * vr + (g - bg!.g) * vg + (b - bg!.b) * vb) / (vr * vr + vg * vg + vb * vb || 1)));
        const d = dist({ r: bg!.r + vr * t, g: bg!.g + vg * t, b: bg!.b + vb * t }, r, g, b);
        if (d < bestD) [best, bestD, bestT] = [k, d, t];
      }
      if (bestT < 0.5) continue;
    }
    if (best < 0) continue;
    whole[p] = 0;
    masks[best][p] = 0;
    content += 1;
    const x = p % width;
    const y = (p - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (content < total * 0.002) throw new AssetError('Nothing to trace was found in that picture.');
  if (content > total * 0.97) {
    throw new AssetError('The logo fills the whole picture, so there is no background to remove. Use a logo on a transparent or plain background.');
  }

  // Grow each colour by a hair, so neighbouring colours meet without a gap showing between them.
  const grown =
    kept.length > 1
      ? await Promise.all(
          masks.map((m) =>
            sharp(m, { raw: { width, height, channels: 1 } }).blur(1.2).threshold(200).extractChannel(0).toColourspace('b-w').raw().toBuffer(),
          ),
        )
      : masks;

  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.01);
  const view = `${Math.max(0, x0 - pad)} ${Math.max(0, y0 - pad)} ${Math.min(width, x1 - x0 + 1 + pad * 2)} ${Math.min(height, y1 - y0 + 1 + pad * 2)}`;
  if (grown.some((m) => m.length !== total)) throw new AssetError('That picture could not be traced. Try a PNG export of the logo.');
  const paths = await Promise.all(grown.map((m) => tracePath(m, width, height)));
  const monoPath = await tracePath(whole, width, height);
  if (!monoPath) throw new AssetError('Nothing to trace was found in that picture.');

  const layers = kept
    .map((c, k) => (paths[k] ? `<path fill="${hex(c)}" fill-rule="evenodd" d="${paths[k]}"/>` : ''))
    .join('');
  const colourSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" fill="none">${layers}</svg>`;
  const monoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" fill="currentColor"><path fill-rule="evenodd" d="${monoPath}"/></svg>`;
  if (colourSvg.length > 290_000 || monoSvg.length > 290_000) {
    throw new AssetError('This picture is too detailed to turn into a logo. Use a simpler, flat version of the logo.');
  }
  return {
    colour: sanitizeSvg(colourSvg, 'Logo'),
    mono: sanitizeSvg(monoSvg, 'Logo'),
    colours: kept.map(hex),
    notes,
  };
}
