import { imageInfo, sanitizeSvg } from './assets';
import { readFolderSearch } from './folder-agent';
import { fontNames, fontWeight, listFiles, readFile } from './sources';

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
export function folderView(brand: string) {
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

