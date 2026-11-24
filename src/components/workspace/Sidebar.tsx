'use client';

import Link from 'next/link';
import { ago } from '@/lib/deck/describe';
import type { DeckSummary } from '@/lib/deck/store';
import type { BrandOption } from '@/lib/workspace';
import { startOfDay, useClock, type Clock } from './clock';
import { IconBook, IconClose, IconCollapse, IconExpand, IconPlus } from './icons';

const STATUS_LABEL: Record<DeckSummary['status'], string> = {
  generating: 'Agent working',
  ready: 'Ready',
  error: 'Needs attention',
};

/** Group projects the way chat apps do: by when they were last touched. */
function groups(decks: DeckSummary[], clock: Clock): { label: string; items: DeckSummary[] }[] {
  const today = startOfDay(clock);
  const day = 86_400_000;
  const buckets = [
    { label: 'Today', from: today },
    { label: 'Yesterday', from: today - day },
    { label: 'Previous 7 days', from: today - 7 * day },
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
  section,
  knowledgeCount,
  collapsed,
  onCollapse,
  onClose,
}: {
  brands: BrandOption[];
  brandId: string;
  onBrand: (id: string) => void;
  decks: DeckSummary[];
  activeId: string | null;
  section: 'new' | 'deck' | 'knowledge';
  knowledgeCount: number;
  /** Folded down to a slim strip of icons (wide screens only). */
  collapsed: boolean;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const brand = brands.find((b) => b.id === brandId);
  const clock = useClock();
  return (
    <aside className="sb" aria-label="Projects">
      <div className="sb-head">
        <Link href="/" className="sb-name">
          Accesso
        </Link>
        <button
          type="button"
          className="icon-btn sb-collapse"
          onClick={onCollapse}
          aria-label={collapsed ? 'Show projects' : 'Collapse projects'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show projects' : 'Collapse projects'}
        >
          {collapsed ? <IconExpand /> : <IconCollapse />}
        </button>
        <button type="button" className="icon-btn sb-close" onClick={onClose} aria-label="Hide projects">
          <IconClose />
        </button>
      </div>

      <Link href="/" className={`sb-new${section === 'new' ? ' is-active' : ''}`} title="New presentation">
        <IconPlus />
        <span className="sb-label">New presentation</span>
      </Link>

      <Link
        href="/knowledge"
        className={`sb-nav${section === 'knowledge' ? ' is-active' : ''}`}
        aria-current={section === 'knowledge' ? 'page' : undefined}
        title="Knowledge base"
      >
        <IconBook />
        <span className="sb-label">Knowledge base</span>
        <span className="sb-count" aria-label={`${knowledgeCount} entries`}>
          {knowledgeCount}
        </span>
      </Link>

      <nav className="sb-list">
        {decks.length === 0 && <p className="sb-empty">Your presentations will be listed here.</p>}
        {groups(decks, clock).map((g) => (
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
                        {ago(d.updatedAt, clock.now, clock.local)}
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
            <select value={brandId} onChange={(e) => onBrand(e.target.value)} disabled={section === 'deck'}>
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
      </div>
    </aside>
  );
}
