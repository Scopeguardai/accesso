import { listBrands, loadBrand } from './brand/load';
import { listKnowledge } from './knowledge/search';

/** What the workspace screens need to know about each brand. Plain data, safe to send to the browser. */
export type BrandOption = {
  id: string;
  name: string;
  defaultPalette: string;
  starters: string[];
  wordmarkSvg: string;
  palettes: { key: string; label: string; dark: string; accent: string; light: string; paper: string }[];
  knowledge: { path: string; title: string; status: string }[];
};

export function brandOptions(): BrandOption[] {
  return listBrands().map((id) => {
    const b = loadBrand(id);
    return {
      id,
      name: b.name,
      defaultPalette: b.defaultPalette,
      starters: b.starters,
      wordmarkSvg: b.svg.wordmark,
      palettes: Object.entries(b.palettes).map(([key, p]) => ({
        key,
        label: p.label,
        dark: p.dark,
        accent: p.accent,
        light: p.light,
        paper: p.paper,
      })),
      knowledge: listKnowledge(id).map((k) => ({ path: k.path, title: k.title, status: k.status })),
    };
  });
}
