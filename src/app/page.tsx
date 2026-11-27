import Landing, { type LandingBrand } from '@/components/landing/Landing';
import { passwordSet } from '@/lib/auth';
import { designData } from '@/lib/brand/design';
import { readImport } from '@/lib/brand/import';
import { listBrands } from '@/lib/brand/load';
import { listDecks } from '@/lib/deck/store';

export const dynamic = 'force-dynamic';

/** The front page: set up a brand in one of three ways, or pick one to work with. */
export default async function Home() {
  const decks = listDecks();
  const brands: LandingBrand[] = listBrands().map((id) => {
    const d = designData(id);
    const palette = d.palettes.find((p) => p.key === d.defaultPalette) ?? d.palettes[0];
    return {
      id,
      name: d.name,
      tagline: d.tagline,
      wordmark: d.logo.wordmark,
      colours: palette ? [palette.colours.dark, palette.colours.accent, palette.colours.light, palette.colours.tint] : [],
      todo: d.todo.length,
      decks: decks.filter((k) => k.brand === id).length,
      proposal: readImport(id).status,
    };
  });
  return <Landing brands={brands} signIn={passwordSet()} />;
}
