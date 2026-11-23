'use client';

import Link from 'next/link';
import { ago } from '@/lib/deck/describe';
import type { DeckSummary } from '@/lib/deck/store';
import type { BrandOption } from '@/lib/workspace';
import { IconClose, IconPlus } from './icons';

const STATUS_LABEL: Record<DeckSummary['status'], string> = {
  generating: 'Agent working',
  ready: 'Ready',
  error: 'Needs attention',
};

/** Group projects the way chat apps do: by when they were last touched. */
function groups(decks: DeckSummary[]): { label: string; items: DeckSummary[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const buckets = [
    { label: 'Today', from: startOfToday.getTime() },
    { label: 'Yesterday', from: startOfToday.getTime() - day },
    { label: 'Previous 7 days', from: startOfToday.getTime() - 7 * day },
    { label: 'Older', from: -Infinity },
  ].map((b) => ({ ...b, items: [] as DeckSummary[] }));
  const sorted = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const d of sorted) {
    const t = Date.parse(d.updatedAt);
    buckets.find((b) => t >= b.from)!.items.push(d);
  }
  return buckets.filter((b) => b.items.length > 0);
}

export default function Sidebar({
  brands,
  brandId,
  onBrand,
  decks,
  activeId,
  onClose,
}: {
  brands: BrandOption[];
  brandId: string;
  onBrand: (id: string) => void;
  decks: DeckSummary[];
  activeId: string | null;
  onClose: () => void;
}) {
  const brand = brands.find((b) => b.id === brandId);
  return (
    <aside className="sb" aria-label="Projects">
      <div className="sb-head">
        <Link href="/" className="sb-name">
          Accesso
        </Link>
        <button type="button" className="icon-btn sb-close" onClick={onClose} aria-label="Hide projects">
          <IconClose />
        </button>
      </div>

      <Link href="/" className={`sb-new${activeId === null ? ' is-active' : ''}`}>
        <IconPlus />
        New presentation
      </Link>

      <nav className="sb-list">
        {decks.length === 0 && <p className="sb-empty">Your presentations will be listed here.</p>}
        {groups(decks).map((g) => (
          <section key={g.label}>
            <h2 className="sb-group">{g.label}</h2>
            <ul>
              {g.items.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/studio/${d.id}`}
                    className={`sb-item${d.id === activeId ? ' is-active' : ''}`}
                    aria-current={d.id === activeId ? 'page' : undefined}
                  >
                    <span className="sb-item-title">{d.title}</span>
                    <span className="sb-item-meta">
                      <span className="dot" data-status={d.status} title={STATUS_LABEL[d.status]} />
                      <span className="sr-only">{STATUS_LABEL[d.status]}, </span>
                      {d.slideCount === 1 ? '1 slide' : `${d.slideCount} slides`}
                      <span aria-hidden="true" className="sb-sep" />
                      <time dateTime={d.updatedAt} suppressHydrationWarning>
                        {ago(d.updatedAt)}
                      </time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="sb-foot">
        {brands.length > 1 ? (
          <label className="sb-brand">
            <span>Brand</span>
            <select value={brandId} onChange={(e) => onBrand(e.target.value)} disabled={activeId !== null}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          brand && (
            <p className="sb-brand">
              <span>Brand</span>
              <strong>{brand.name}</strong>
            </p>
          )
        )}
        {brand && (
          <p className="sb-kb">
            {brand.knowledge.length === 1 ? '1 knowledge file' : `${brand.knowledge.length} knowledge files`}
          </p>
        )}
      </div>
    </aside>
  );
}
