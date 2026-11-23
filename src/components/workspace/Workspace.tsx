'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Brief, Deck } from '@/lib/deck/schema';
import type { DeckSummary } from '@/lib/deck/store';
import type { BrandOption } from '@/lib/workspace';
import Composer from './Composer';
import NewDeck from './NewDeck';
import Preview from './Preview';
import Sidebar from './Sidebar';
import Thread from './Thread';
import { IconMenu } from './icons';
import './workspace.css';

const STATUS_TEXT: Record<Deck['status'], string> = {
  generating: 'Agent working',
  ready: 'Ready',
  error: 'Needs attention',
};

function TitleField({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  const commit = () => {
    const t = value.trim();
    if (t && t !== title) onRename(t);
    else setValue(title);
  };
  return (
    <input
      className="bar-title"
      value={value}
      maxLength={120}
      aria-label="Presentation title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(title);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * The three-column workspace: projects, the conversation with the agent,
 * and the live presentation. Mounted once per project (keyed by deck id).
 */
export default function Workspace({
  brands,
  decks: initialDecks,
  deck: initialDeck,
}: {
  brands: BrandOption[];
  decks: DeckSummary[];
  deck: Deck | null;
}) {
  const router = useRouter();
  const deckId = initialDeck?.id ?? null;
  const [decks, setDecks] = useState(initialDecks);
  const [deck, setDeck] = useState(initialDeck);
  const [brandId, setBrandId] = useState(initialDeck?.brand ?? brands[0]?.id ?? '');
  const [inView, setInView] = useState<string | null>(initialDeck?.slides[0]?.id ?? null);
  const [drawer, setDrawer] = useState(false);
  const [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const working = deck?.status === 'generating';
  const busy = working || sending;

  const syncSummary = (next: Deck) =>
    setDecks((list) => {
      const summary: DeckSummary = {
        id: next.id,
        brand: next.brand,
        title: next.title,
        status: next.status,
        slideCount: next.slides.length,
        updatedAt: next.updatedAt,
      };
      return list.some((s) => s.id === next.id)
        ? list.map((s) => (s.id === next.id ? summary : s))
        : [summary, ...list];
    });

  const refreshDeck = useCallback(async () => {
    if (!deckId) return;
    const res = await fetch(`/api/decks/${deckId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const next: Deck = await res.json();
    setDeck(next);
    syncSummary(next);
  }, [deckId]);

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/decks', { cache: 'no-store' });
    if (res.ok) setDecks(await res.json());
  }, []);

  // Follow a run in progress on this deck.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(refreshDeck, 1500);
    return () => clearInterval(timer);
  }, [working, refreshDeck]);

  // Keep the status dots of other projects current while any of them is working.
  const othersWorking = decks.some((d) => d.status === 'generating' && d.id !== deckId);
  useEffect(() => {
    if (!othersWorking) return;
    const timer = setInterval(refreshList, 5000);
    return () => clearInterval(timer);
  }, [othersWorking, refreshList]);

  // Stay at the bottom of the conversation as it grows, unless the person has scrolled up.
  const pinned = useRef(true);
  const lastEntry = deck?.thread.at(-1);
  const growth = `${deck?.thread.length}:${lastEntry?.role === 'agent' ? lastEntry.steps.length + lastEntry.text.length : 0}:${deck?.suggestions.length}`;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [growth]);

  async function createDeck(brief: Brief) {
    if (!brand) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand: brand.id, brief }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The presentation could not be started. Try again.');
      router.push(`/studio/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  }

  async function sendEdit(text: string, slideId?: string): Promise<boolean> {
    if (!deck) return false;
    setSending(true);
    setError('');
    pinned.current = true;
    const now = new Date().toISOString();
    setDeck(
      (d) =>
        d && {
          ...d,
          status: 'generating',
          thread: [...d.thread, { id: `local-${now}`, role: 'user', at: now, text, slideId }],
        },
    );
    try {
      const res = await fetch(`/api/decks/${deck.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request: text, slideId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The change could not be sent. Try again.');
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      await refreshDeck();
      setSending(false);
    }
  }

  async function patchDeck(body: { title?: string; palette?: string }) {
    if (!deck) return;
    setError('');
    const res = await fetch(`/api/decks/${deck.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'That change could not be saved.');
      return;
    }
    setDeck(data);
    syncSummary(data);
  }

  const goto = useCallback((slideId: string) => {
    setInView(slideId);
    setPane('preview');
    frameRef.current?.contentWindow?.postMessage({ type: 'accesso:goto', id: slideId }, window.location.origin);
  }, []);

  return (
    <div className="ws" data-pane={pane} data-drawer={drawer ? 'open' : undefined}>
      <Sidebar
        brands={brands}
        brandId={brandId}
        onBrand={setBrandId}
        decks={decks}
        activeId={deckId}
        onClose={() => setDrawer(false)}
      />
      <button
        type="button"
        className="ws-scrim"
        aria-label="Hide projects"
        tabIndex={-1}
        onClick={() => setDrawer(false)}
      />

      <header className="bar">
        <button type="button" className="icon-btn bar-menu" onClick={() => setDrawer(true)} aria-label="Show projects">
          <IconMenu />
        </button>
        {deck ? (
          <>
            <TitleField title={deck.title} onRename={(title) => patchDeck({ title })} />
            <span className="status" data-status={deck.status}>
              <span className="dot" data-status={deck.status} aria-hidden="true" />
              {STATUS_TEXT[deck.status]}
            </span>
          </>
        ) : (
          <span className="bar-title bar-title-static">New presentation</span>
        )}
        <div className="seg bar-tabs" role="group" aria-label="Show">
          <button type="button" aria-pressed={pane === 'chat'} onClick={() => setPane('chat')}>
            Chat
          </button>
          <button type="button" aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>
            Preview
          </button>
        </div>
      </header>

      <section className="ws-chat" aria-label="Conversation">
        {deck ? (
          <>
            <div
              className="ws-scroll"
              ref={scroller}
              onScroll={(e) => {
                const el = e.currentTarget;
                pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
            >
              <Thread deck={deck} brand={brand} busy={busy} onApply={sendEdit} onGoto={goto} />
            </div>
            <Composer
              deck={deck}
              brand={brand}
              inView={inView}
              busy={busy}
              error={error}
              onSend={sendEdit}
              onPalette={(palette) => patchDeck({ palette })}
            />
          </>
        ) : brand ? (
          <div className="ws-scroll">
            <NewDeck brand={brand} busy={sending} error={error} onCreate={createDeck} />
          </div>
        ) : (
          <p className="ws-empty">Add a brand pack to the brands folder to start.</p>
        )}
      </section>

      <section className="ws-preview" aria-label="Presentation preview">
        <Preview deck={deck} brand={brand} frameRef={frameRef} inView={inView} onInView={setInView} onGoto={goto} />
      </section>
    </div>
  );
}
