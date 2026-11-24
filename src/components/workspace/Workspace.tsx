'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Brief, Deck } from '@/lib/deck/schema';
import type { DeckSummary } from '@/lib/deck/store';
import type { KnowledgeSummary } from '@/lib/knowledge/format';
import type { LayoutPref } from '@/lib/layout-pref';
import type { BrandOption } from '@/lib/workspace';
import { ClockProvider } from './clock';
import Composer from './Composer';
import KnowledgeView from './KnowledgeView';
import NewDeck from './NewDeck';
import Preview from './Preview';
import Resizer from './Resizer';
import Sidebar from './Sidebar';
import Thread from './Thread';
import { IconCollapse, IconExpand, IconMenu } from './icons';
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
  view,
  knowledge,
  entry,
  renderedAt,
  layout,
}: {
  brands: BrandOption[];
  decks: DeckSummary[];
  deck: Deck | null;
  /** Show the knowledge base instead of a presentation. */
  view?: 'knowledge';
  /** The knowledge entries for the knowledge view, and the one to open first. */
  knowledge?: KnowledgeSummary[];
  entry?: string;
  /** When the server rendered the page, so the first browser render matches it. */
  renderedAt: number;
  /** Which columns were collapsed last time, read from a cookie so the page renders that way at once. */
  layout: LayoutPref;
}) {
  const router = useRouter();
  const deckId = initialDeck?.id ?? null;
  const [decks, setDecks] = useState(initialDecks);
  const [deck, setDeck] = useState(initialDeck);
  const [brandId, setBrandId] = useState(initialDeck?.brand ?? entry?.split('/')[0] ?? brands[0]?.id ?? '');
  const [inView, setInView] = useState<string | null>(initialDeck?.slides[0]?.id ?? null);
  const [drawer, setDrawer] = useState(false);
  const [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const section = view === 'knowledge' ? 'knowledge' : initialDeck ? 'deck' : 'new';
  const [kbCounts, setKbCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(brands.map((b) => [b.id, b.knowledge.length])),
  );
  const kbCount = brand ? (kbCounts[brand.id] ?? 0) : 0;
  const brandKey = brand?.id;
  const setKbCount = useCallback(
    (n: number) => setKbCounts((c) => (brandKey ? { ...c, [brandKey]: n } : c)),
    [brandKey],
  );
  const working = deck?.status === 'generating';
  const busy = working || sending;

  // Collapsible columns. The presentation (or knowledge entry) column always stays.
  // On the new-presentation screen the conversation holds the brief, so it never collapses there.
  const [projectsCollapsed, setProjectsCollapsed] = useState(layout.projects);
  const [conversationPref, setConversationPref] = useState(layout.conversation);
  const canCollapseConversation = section !== 'new';
  const conversationCollapsed = canCollapseConversation && conversationPref;
  const focused = projectsCollapsed && conversationCollapsed;
  // Column widths set by dragging the dividers. Undefined means the default width.
  const [sbWidth, setSbWidth] = useState(layout.projectsWidth);
  const [midWidth, setMidWidth] = useState(layout.conversationWidth);
  const root = useRef<HTMLDivElement>(null);
  const SB = { min: 200, max: 420 };
  const MID_MIN = 300;
  const PREVIEW_MIN = 340;
  const clamp = (n: number, min: number, max: number) => Math.round(Math.min(Math.max(n, min), Math.max(min, max)));
  const edge = (selector: string) => root.current?.querySelector(selector)?.getBoundingClientRect();
  const resizeProjects = (change: { x: number } | { step: number }) => {
    const current = edge('.sb')?.width ?? 248;
    const midNow = edge('.ws-chat, .mid-rail')?.width ?? 0;
    const room = window.innerWidth - midNow - PREVIEW_MIN;
    setSbWidth(clamp('x' in change ? change.x : current + change.step, SB.min, Math.min(SB.max, room)));
  };
  const resizeConversation = (change: { x: number } | { step: number }) => {
    const box = edge('.ws-chat');
    if (!box) return;
    const room = window.innerWidth - box.left - PREVIEW_MIN;
    setMidWidth(clamp('x' in change ? change.x - box.left : box.width + change.step, MID_MIN, room));
  };
  useEffect(() => {
    const value = `${projectsCollapsed ? 1 : 0}${conversationPref ? 1 : 0}.${sbWidth ?? 0}.${midWidth ?? 0}`;
    document.cookie = `accesso_layout=${value}; path=/; max-age=31536000; samesite=lax`;
  }, [projectsCollapsed, conversationPref, sbWidth, midWidth]);
  // Dragged widths apply only to open columns; collapsed ones use the slim strip width from the stylesheet.
  const widths = {
    ...(sbWidth && !projectsCollapsed ? { '--sb-w': `${sbWidth}px` } : {}),
    ...(midWidth && !conversationCollapsed ? { '--mid-w': `min(${midWidth}px, calc(100vw - var(--sb-w) - ${PREVIEW_MIN}px))` } : {}),
  } as CSSProperties;
  const toggleFocus = () => {
    const next = !focused;
    setProjectsCollapsed(next);
    setConversationPref(next);
  };
  const midName = section === 'knowledge' ? 'entries' : 'conversation';

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
    <ClockProvider renderedAt={renderedAt}>
      <div
        className="ws"
        ref={root}
        style={widths}
        data-pane={pane}
        data-drawer={drawer ? 'open' : undefined}
        data-projects={projectsCollapsed ? 'collapsed' : undefined}
        data-mid={conversationCollapsed ? 'collapsed' : undefined}
      >
        <Sidebar
          brands={brands}
          brandId={brandId}
          onBrand={setBrandId}
          decks={decks}
          activeId={deckId}
          section={section}
          knowledgeCount={kbCount}
          collapsed={projectsCollapsed}
          onCollapse={() => setProjectsCollapsed((c) => !c)}
          onClose={() => setDrawer(false)}
        />
        {!projectsCollapsed && (
          <Resizer
            which="projects"
            label="Resize the projects column"
            value={sbWidth}
            min={SB.min}
            max={SB.max}
            onResize={resizeProjects}
            onReset={() => setSbWidth(undefined)}
          />
        )}
        {!conversationCollapsed && (
          <Resizer
            which="conversation"
            label={`Resize the ${midName} column`}
            value={midWidth}
            min={MID_MIN}
            max={1200}
            onResize={resizeConversation}
            onReset={() => setMidWidth(undefined)}
          />
        )}
        <button
          type="button"
          className="ws-scrim"
          aria-label="Hide projects"
          tabIndex={-1}
          onClick={() => setDrawer(false)}
        />

        <header className="bar">
          <button
            type="button"
            className="icon-btn bar-menu"
            onClick={() => setDrawer(true)}
            aria-label="Show projects"
          >
            <IconMenu />
          </button>
          {section === 'knowledge' ? (
            <>
              <span className="bar-title bar-title-static">Knowledge base</span>
              <span className="status">
                {kbCount === 1 ? '1 entry' : `${kbCount} entries`}
                {brands.length > 1 && brand ? ` for ${brand.name}` : ''}
              </span>
            </>
          ) : deck ? (
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
          {canCollapseConversation && (
            <button
              type="button"
              className="icon-btn bar-collapse"
              onClick={() => setConversationPref(true)}
              aria-label={`Collapse the ${midName}`}
              title={`Collapse the ${midName}`}
            >
              <IconCollapse />
            </button>
          )}
          <div className="seg bar-tabs" role="group" aria-label="Show">
            <button type="button" aria-pressed={pane === 'chat'} onClick={() => setPane('chat')}>
              {section === 'knowledge' ? 'Entries' : 'Chat'}
            </button>
            <button type="button" aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>
              {section === 'knowledge' ? 'Entry' : 'Preview'}
            </button>
          </div>
        </header>

        {conversationCollapsed && (
          <div className="mid-rail">
            <button
              type="button"
              className="icon-btn mid-rail-menu"
              onClick={() => setDrawer(true)}
              aria-label="Show projects"
              title="Show projects"
            >
              <IconMenu />
            </button>
            <button
              type="button"
              className="mid-rail-open"
              onClick={() => setConversationPref(false)}
              aria-label={`Show the ${midName}`}
              title={`Show the ${midName}`}
            >
              <IconExpand />
              {deck && <span className="dot" data-status={deck.status} aria-hidden="true" />}
              <span className="mid-rail-label">
                {section === 'knowledge' ? 'Entries' : (deck?.title ?? 'Conversation')}
              </span>
            </button>
          </div>
        )}

        {section === 'knowledge' && brand ? (
          <KnowledgeView
            key={brand.id}
            brand={brand}
            initial={brand.id === (entry?.split('/')[0] ?? brands[0]?.id) ? (knowledge ?? []) : []}
            initialPath={entry?.startsWith(`${brand.id}/`) ? entry : undefined}
            onCount={setKbCount}
            onShowEntry={() => setPane('preview')}
          />
        ) : (
          <>
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
              <Preview
                deck={deck}
                brand={brand}
                frameRef={frameRef}
                inView={inView}
                onInView={setInView}
                onGoto={goto}
                focused={focused}
                onToggleFocus={canCollapseConversation ? toggleFocus : undefined}
              />
            </section>
          </>
        )}
      </div>
    </ClockProvider>
  );
}
