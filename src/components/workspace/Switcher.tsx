'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DeckSummary } from '@/lib/deck/store';
import { IconBook, IconChevron, IconPlus } from './icons';

const STATUS_LABEL: Record<DeckSummary['status'], string> = {
  generating: 'Agent working',
  ready: 'Ready',
  error: 'Needs attention',
};

/** The menu behind the presentation title: jump to another presentation, start a new one, or open the knowledge base. */
export default function Switcher({ decks, activeId }: { decks: DeckSummary[]; activeId: string | null }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sorted = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="switch" ref={wrap}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Switch presentation"
        title="Switch presentation"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconChevron />
      </button>
      {open && (
        <nav className="switch-menu" aria-label="Presentations">
          <Link href="/new" className="switch-row">
            <IconPlus />
            New presentation
          </Link>
          <Link href="/design" className="switch-row">
            <IconBook />
            Design system
          </Link>
          {sorted.length > 0 && <p className="switch-head">Presentations</p>}
          <ul>
            {sorted.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/studio/${d.id}`}
                  className="switch-row"
                  aria-current={d.id === activeId ? 'page' : undefined}
                >
                  <span className="dot" data-status={d.status} title={STATUS_LABEL[d.status]} />
                  <span className="sr-only">{STATUS_LABEL[d.status]}: </span>
                  <span className="switch-title">{d.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
