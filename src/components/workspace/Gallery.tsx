'use client';

import Link from 'next/link';
import { ago } from '@/lib/deck/describe';
import type { DeckSummary } from '@/lib/deck/store';
import type { BrandOption } from '@/lib/workspace';
import { useClock } from './clock';

const STATUS_LABEL: Record<DeckSummary['status'], string> = {
  generating: 'Agent working',
  ready: 'Ready',
  error: 'Needs attention',
};

/** The presentations on the home page, each as a tile in its own brand palette. */
export default function Gallery({ decks, brands }: { decks: DeckSummary[]; brands: BrandOption[] }) {
  const clock = useClock();
  if (decks.length === 0) return null;
  const sorted = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section className="gal" aria-label="Your presentations">
      <h2 className="new-h2">Your presentations</h2>
      <ul>
        {sorted.map((d) => {
          const brand = brands.find((b) => b.id === d.brand);
          const palette = brand?.palettes.find((p) => p.key === d.palette) ?? brand?.palettes[0];
          return (
            <li key={d.id}>
              <Link href={`/studio/${d.id}`} className="gal-card">
                <span
                  className="gal-cover"
                  style={palette ? { background: palette.dark, color: palette.accent } : undefined}
                  aria-hidden="true"
                >
                  {brand && <span className="gal-mark" dangerouslySetInnerHTML={{ __html: brand.wordmarkSvg }} />}
                </span>
                <span className="gal-title">{d.title}</span>
                <span className="gal-meta">
                  <span className="dot" data-status={d.status} aria-hidden="true" />
                  {d.status === 'ready'
                    ? d.slideCount === 1
                      ? '1 slide'
                      : `${d.slideCount} slides`
                    : STATUS_LABEL[d.status]}
                  <span aria-hidden="true">·</span>
                  <time dateTime={d.updatedAt} suppressHydrationWarning>
                    {ago(d.updatedAt, clock.now, clock.local)}
                  </time>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
