'use client';

import Link from 'next/link';
import type { DeckSummary } from '@/lib/deck/store';
import type { BrandOption } from '@/lib/workspace';
import AccessoLogo from './AccessoLogo';
import SettingsMenu from './SettingsMenu';
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
  const clock = useClock();
  return (
    <aside className="sb" aria-label="Projects">
      <div className="sb-head">
        <Link href="/" className="sb-name" aria-label="Accesso, new presentation">
          <AccessoLogo className="sb-logo" />
          <AccessoLogo variant="mark" className="sb-mark" />
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
                    <span className="dot" data-status={d.status} title={STATUS_LABEL[d.status]} />
                    <span className="sr-only">{STATUS_LABEL[d.status]}: </span>
                    <span className="sb-item-title">{d.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="sb-foot">
        <SettingsMenu brands={brands} brandId={brandId} onBrand={onBrand} brandLocked={section === 'deck'} />
      </div>
    </aside>
  );
}
