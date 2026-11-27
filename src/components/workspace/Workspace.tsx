'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DesignData } from '@/lib/brand/design';
import type { Brief, Deck } from '@/lib/deck/schema';
import type { DeckSummary } from '@/lib/deck/store';
import type { KnowledgeSummary } from '@/lib/knowledge/format';
import type { BrandOption } from '@/lib/workspace';
import FossefallLogo from './FossefallLogo';
import { ClockProvider } from './clock';
import Composer from './Composer';
import { copyText } from './copy';
import DesignView from './DesignView';
import Gallery from './Gallery';
import KnowledgeView from './KnowledgeView';
import NewDeck from './NewDeck';
import Preview, { type PreviewMode } from './Preview';
import SettingsMenu from './SettingsMenu';
import Switcher from './Switcher';
import Thread from './Thread';
import {
  IconBook,
  IconCheck,
  IconClose,
  IconDesktop,
  IconExternal,
  IconHistory,
  IconLink,
  IconPalette,
  IconPhone,
} from './icons';
import './workspace.css';
import './shell.css';

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

/** One line under the canvas saying what the agent is doing or last did. */
function statusLine(deck: Deck): { text: string; tone: 'working' | 'error' | 'done' } | null {
  const last = deck.thread.findLast((e) => e.role === 'agent');
  if (deck.status === 'generating') {
    const step = last?.role === 'agent' && last.status === 'working' ? last.steps.at(-1)?.text : undefined;
    return { text: step ?? 'Reading the request…', tone: 'working' };
  }
  if (last?.role === 'agent' && last.status === 'error') return { text: last.text, tone: 'error' };
  const text = (last?.text ?? deck.statusNote ?? '').split(/\n\s*\n/)[0].trim();
  return text ? { text, tone: 'done' } : null;
}

/**
 * The app shell. A presentation fills the screen with a prompt bar under it;
 * the conversation with the agent is a History panel that slides in from the
 * right. The home page is the brief plus a gallery, the knowledge base is a
 * list beside the open entry, and the design system is one scrolling page.
 */
export default function Workspace({
  brands,
  decks: initialDecks,
  deck: initialDeck,
  view,
  knowledge,
  entry,
  designs,
  renderedAt,
}: {
  brands: BrandOption[];
  decks: DeckSummary[];
  deck: Deck | null;
  /** Show the knowledge base or the design system instead of a presentation. */
  view?: 'knowledge' | 'design';
  /** The knowledge entries for the knowledge view, and the one to open first. */
  knowledge?: KnowledgeSummary[];
  entry?: string;
  /** Each brand's design system, for the design view. */
  designs?: DesignData[];
  /** When the server rendered the page, so the first browser render matches it. */
  renderedAt: number;
}) {
  const router = useRouter();
  const deckId = initialDeck?.id ?? null;
  const [decks, setDecks] = useState(initialDecks);
  const [deck, setDeck] = useState(initialDeck);
  const [brandId, setBrandId] = useState(initialDeck?.brand ?? entry?.split('/')[0] ?? brands[0]?.id ?? '');
  const [inView, setInView] = useState<string | null>(initialDeck?.slides[0]?.id ?? null);
  const [history, setHistory] = useState(false);
  const [mode, setMode] = useState<PreviewMode>('desktop');
  const [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const section = view ?? (initialDeck ? 'deck' : 'new');
  const working = deck?.status === 'generating';
  const busy = working || sending;

  const [kbCounts, setKbCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(brands.map((b) => [b.id, b.knowledge.length])),
  );
  const brandKey = brand?.id;
  const setKbCount = useCallback(
    (n: number) => setKbCounts((c) => (brandKey ? { ...c, [brandKey]: n } : c)),
    [brandKey],
  );
  const kbCount = brand ? (kbCounts[brand.id] ?? 0) : 0;

  // On a phone, show the deck as a phone would. On a wide screen, open the
  // history for a deck that is still being written, so its progress is visible.
  const startedWorking = useRef(initialDeck?.status === 'generating');
  useEffect(() => {
    if (window.matchMedia('(max-width: 820px)').matches) setMode('phone');
    else if (startedWorking.current && window.matchMedia('(min-width: 1100px)').matches) setHistory(true);
  }, []);

  const syncSummary = (next: Deck) =>
    setDecks((list) => {
      const summary: DeckSummary = {
        id: next.id,
        brand: next.brand,
        title: next.title,
        status: next.status,
        palette: next.palette,
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

  // Keep the status of other presentations current while any of them is being worked on.
  const othersWorking = decks.some((d) => d.status === 'generating' && d.id !== deckId);
  useEffect(() => {
    if (!othersWorking) return;
    const timer = setInterval(refreshList, 5000);
    return () => clearInterval(timer);
  }, [othersWorking, refreshList]);

  // Stay at the bottom of the history as it grows, unless the person has scrolled up.
  const pinned = useRef(true);
  const lastEntry = deck?.thread.at(-1);
  const growth = `${history}:${deck?.thread.length}:${lastEntry?.role === 'agent' ? lastEntry.steps.length + lastEntry.text.length : 0}:${deck?.suggestions.length}`;
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
    frameRef.current?.contentWindow?.postMessage({ type: 'accesso:goto', id: slideId }, window.location.origin);
    // On a small screen the history covers the deck, so close it to show the slide.
    if (window.matchMedia('(max-width: 1099px)').matches) setHistory(false);
  }, []);

  async function copyLink() {
    if (!deck) return;
    const ok = await copyText(`${window.location.origin}/d/${deck.id}`);
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied('idle'), 2200);
  }

  const line = deck ? statusLine(deck) : null;
  const suggestionCount = deck && !working ? deck.suggestions.length : 0;

  return (
    <ClockProvider renderedAt={renderedAt}>
      <div className="ws cv" data-view={section} data-pane={section === 'knowledge' ? pane : undefined}>
        <header className="top">
          <Link href="/" className="top-home" aria-label="Home" title="Home">
            {section === 'new' ? <FossefallLogo /> : <FossefallLogo variant="mark" />}
          </Link>

          {deck ? (
            <>
              <Switcher decks={decks} activeId={deck.id} />
              <TitleField title={deck.title} onRename={(title) => patchDeck({ title })} />
              <span className="status" data-status={deck.status}>
                <span className="dot" data-status={deck.status} aria-hidden="true" />
                {STATUS_TEXT[deck.status]}
              </span>
            </>
          ) : (
            <>
              {section === 'knowledge' && (
                <span className="top-page">
                  Knowledge base
                  <span className="top-count">{kbCount === 1 ? '1 entry' : `${kbCount} entries`}</span>
                </span>
              )}
              {section === 'design' && <span className="top-page">Design system</span>}
              <span className="grow" />
            </>
          )}

          {section === 'knowledge' && (
            <div className="seg kb-tabs" role="group" aria-label="Show">
              <button type="button" aria-pressed={pane === 'chat'} onClick={() => setPane('chat')}>
                Entries
              </button>
              <button type="button" aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>
                Entry
              </button>
            </div>
          )}

          {deck && (
            <>
              <div className="seg top-wide" role="group" aria-label="Preview size">
                <button
                  type="button"
                  aria-pressed={mode === 'desktop'}
                  onClick={() => setMode('desktop')}
                  aria-label="Desktop size"
                  title="Desktop size"
                >
                  <IconDesktop />
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'phone'}
                  onClick={() => setMode('phone')}
                  aria-label="Phone size"
                  title="Phone size"
                >
                  <IconPhone />
                </button>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setHistory((h) => !h)}
                aria-pressed={history}
                aria-label="History"
                title="History: the conversation with the agent"
              >
                <IconHistory />
              </button>
              <button type="button" className="btn-quiet" onClick={copyLink} aria-live="polite" title="Copy the link">
                {copied === 'ok' ? <IconCheck /> : <IconLink />}
                <span className="top-text">
                  {copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy failed' : 'Share'}
                </span>
              </button>
              <a
                className="icon-btn top-wide"
                href={`/d/${deck.id}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open the presentation in a new tab"
                title="Open in a new tab"
              >
                <IconExternal />
              </a>
            </>
          )}

          {(section === 'knowledge' || section === 'design') && (
            <Link href="/" className="btn-quiet top-wide" title="Back to presentations">
              Presentations
            </Link>
          )}
          {section === 'new' && (
            <>
              <Link href="/design" className="btn-quiet top-wide" title="The brand the agent designs with">
                <IconPalette />
                Design system
              </Link>
              <Link href="/knowledge" className="btn-quiet top-wide" title="What the agent knows">
                <IconBook />
                Knowledge base
              </Link>
              <Link href="/design" className="icon-btn top-narrow" aria-label="Design system" title="Design system">
                <IconPalette />
              </Link>
              <Link href="/knowledge" className="icon-btn top-narrow" aria-label="Knowledge base" title="Knowledge base">
                <IconBook />
              </Link>
            </>
          )}
          <SettingsMenu brands={brands} brandId={brandId} onBrand={setBrandId} brandLocked={section === 'deck'} />
        </header>

        {section === 'design' && brand ? (
          <div className="cv-design">
            {(() => {
              const design = designs?.find((d) => d.id === brand.id);
              return design ? (
                <DesignView key={brand.id} design={design} />
              ) : (
                <p className="ws-empty">This brand has no design system yet.</p>
              );
            })()}
          </div>
        ) : section === 'knowledge' && brand ? (
          <div className="cv-kb">
            <KnowledgeView
              key={brand.id}
              brand={brand}
              initial={brand.id === (entry?.split('/')[0] ?? brands[0]?.id) ? (knowledge ?? []) : []}
              initialPath={entry?.startsWith(`${brand.id}/`) ? entry : undefined}
              onCount={setKbCount}
              onShowEntry={() => setPane('preview')}
            />
          </div>
        ) : deck ? (
          <div className="cv-body" data-history={history ? 'open' : undefined}>
            <main className="cv-main">
              <Preview deck={deck} mode={mode} frameRef={frameRef} inView={inView} onInView={setInView} onGoto={goto} />
              <div className="dock">
                {(line || suggestionCount > 0) && (
                  <p className="dock-line" data-tone={line?.tone}>
                    {line?.tone === 'working' && <span className="dot" data-status="generating" aria-hidden="true" />}
                    {line && (
                      <button type="button" className="dock-text" onClick={() => setHistory(true)} title="Open history">
                        {line.text}
                      </button>
                    )}
                    {suggestionCount > 0 && (
                      <button type="button" className="dock-chip" onClick={() => setHistory(true)}>
                        {suggestionCount === 1 ? '1 suggestion' : `${suggestionCount} suggestions`}
                      </button>
                    )}
                  </p>
                )}
                <Composer
                  deck={deck}
                  brand={brand}
                  inView={inView}
                  busy={busy}
                  error={error}
                  onSend={sendEdit}
                  onPalette={(palette) => patchDeck({ palette })}
                />
              </div>
            </main>

            {history && (
              <aside className="hist" aria-label="History">
                <header className="hist-head">
                  <h2>History</h2>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setHistory(false)}
                    aria-label="Close history"
                  >
                    <IconClose />
                  </button>
                </header>
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
              </aside>
            )}
          </div>
        ) : brand ? (
          <main className="cv-home">
            <NewDeck brand={brand} busy={sending} error={error} onCreate={createDeck} />
            <Gallery decks={decks} brands={brands} />
          </main>
        ) : (
          <p className="ws-empty">Add a brand pack to the brands folder to start.</p>
        )}
      </div>
    </ClockProvider>
  );
}
