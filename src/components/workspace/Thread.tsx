'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ago } from '@/lib/deck/describe';
import type { AgentEntry, Brief, Deck, Step, Suggestion, ThreadEntry } from '@/lib/deck/schema';
import type { BrandOption } from '@/lib/workspace';
import {
  IconBook,
  IconChevron,
  IconIdea,
  IconNote,
  IconOrder,
  IconOutline,
  IconPalette,
  IconSearch,
  IconSlide,
  IconTrash,
} from './icons';

const STEP_ICON: Record<Step['kind'], () => ReactNode> = {
  search: IconSearch,
  read: IconBook,
  outline: IconOutline,
  slide: IconSlide,
  remove: IconTrash,
  order: IconOrder,
  deck: IconPalette,
  suggest: IconIdea,
  note: IconNote,
};

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => <p key={i}>{p}</p>);

/** "Searched 3 times, read 2 sources and wrote 8 slides." */
function summarize(steps: Step[]): string {
  const count = (k: Step['kind']) => steps.filter((s) => s.kind === k).length;
  const sources = new Set(steps.filter((s) => s.kind === 'read').map((s) => s.ref)).size;
  const slides = new Set(steps.filter((s) => s.kind === 'slide').map((s) => s.ref)).size;
  const parts = [
    count('search') && `searched ${count('search') === 1 ? 'once' : `${count('search')} times`}`,
    sources && `read ${sources === 1 ? '1 source' : `${sources} sources`}`,
    slides && `worked on ${slides === 1 ? '1 slide' : `${slides} slides`}`,
  ].filter(Boolean) as string[];
  if (parts.length === 0) return steps.length === 1 ? '1 step' : `${steps.length} steps`;
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return text[0].toUpperCase() + text.slice(1);
}

function Steps({
  steps,
  working,
  slideNumber,
  onGoto,
}: {
  steps: Step[];
  working: boolean;
  slideNumber: (id?: string) => number;
  onGoto: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = working || open;
  return (
    <div className="steps">
      {!working && (
        <button type="button" className="steps-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {summarize(steps)}
          <IconChevron width={16} height={16} className="steps-chev" />
        </button>
      )}
      {shown && (
        <ol className="steps-list">
          {steps.map((s, i) => {
            const Icon = STEP_ICON[s.kind];
            const n = s.kind === 'slide' ? slideNumber(s.ref) : 0;
            const live = working && i === steps.length - 1;
            return (
              <li key={i} data-kind={s.kind} data-live={live ? '' : undefined}>
                <Icon />
                {n > 0 ? (
                  <button type="button" className="link" onClick={() => onGoto(s.ref!)}>
                    {s.text}
                  </button>
                ) : s.kind === 'read' && s.ref ? (
                  <Link
                    href={`/knowledge?entry=${encodeURIComponent(s.ref)}`}
                    className="link"
                    title="Open in the knowledge base"
                  >
                    {s.text}
                  </Link>
                ) : (
                  <span>{s.text}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function BriefDetails({ brief, brand }: { brief: Brief; brand?: BrandOption }) {
  const palette = brand?.palettes.find((p) => p.key === brief.palette)?.label.replace(/\s*\(.*\)$/, '');
  const items: [string, string][] = [
    ['Slides', String(brief.slideCount)],
    ['Palette', palette ?? 'Agent chooses'],
  ];
  if (brief.audience) items.push(['Audience', brief.audience]);
  if (brief.goal) items.push(['Goal', brief.goal]);
  if (brief.tone) items.push(['Tone', brief.tone]);
  return (
    <dl className="brief">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Suggestions({
  items,
  busy,
  slideNumber,
  onApply,
  onGoto,
}: {
  items: Suggestion[];
  busy: boolean;
  slideNumber: (id?: string) => number;
  onApply: (s: Suggestion) => void;
  onGoto: (id: string) => void;
}) {
  return (
    <div className="sugg">
      <h3 className="sugg-title">Suggestions</h3>
      <ul>
        {items.map((s, i) => {
          const n = slideNumber(s.slideId);
          return (
            <li key={i} className="sugg-item">
              <p>
                <span className="sugg-kind">{s.kind === 'design' ? 'Design' : 'Content'}</span>
                {n > 0 && (
                  <button type="button" className="link sugg-ref" onClick={() => onGoto(s.slideId!)}>
                    Slide {n}
                  </button>
                )}
              </p>
              <p className="sugg-text">{s.text}</p>
              <button type="button" className="btn-quiet" disabled={busy} onClick={() => onApply(s)}>
                Apply
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AgentMessage({
  entry,
  suggestions,
  busy,
  slideNumber,
  onApply,
  onGoto,
}: {
  entry: AgentEntry;
  suggestions: Suggestion[];
  busy: boolean;
  slideNumber: (id?: string) => number;
  onApply: (s: Suggestion) => void;
  onGoto: (id: string) => void;
}) {
  const working = entry.status === 'working';
  return (
    <article className="msg msg-agent" data-status={entry.status} aria-busy={working}>
      <header className="msg-head">
        <span className="agent-mark" aria-hidden="true" />
        <span className="msg-who">Agent</span>
        {working ? (
          <span className="msg-state">Working</span>
        ) : (
          <time dateTime={entry.at} suppressHydrationWarning>
            {ago(entry.at)}
          </time>
        )}
      </header>
      {entry.steps.length > 0 && (
        <Steps steps={entry.steps} working={working} slideNumber={slideNumber} onGoto={onGoto} />
      )}
      {working && entry.steps.length === 0 && <p className="msg-wait">Reading the request…</p>}
      {entry.text && (
        <div
          className={entry.status === 'error' ? 'msg-text msg-error' : 'msg-text'}
          role={entry.status === 'error' ? 'alert' : undefined}
        >
          {entry.status === 'error' && <p className="msg-error-title">The run stopped.</p>}
          {paragraphs(entry.text)}
        </div>
      )}
      {suggestions.length > 0 && (
        <Suggestions items={suggestions} busy={busy} slideNumber={slideNumber} onApply={onApply} onGoto={onGoto} />
      )}
    </article>
  );
}

/** Decks made before conversations existed (like the sample) get their brief and note shown as one. */
function entriesFor(deck: Deck): ThreadEntry[] {
  if (deck.thread.length > 0) return deck.thread;
  return [
    { id: 'brief', role: 'user', at: deck.createdAt, text: deck.brief.prompt, brief: deck.brief },
    {
      id: 'note',
      role: 'agent',
      at: deck.updatedAt,
      status: 'done',
      text: deck.statusNote ?? 'This deck is ready. Ask for any change below.',
      steps: [],
    },
  ];
}

export default function Thread({
  deck,
  brand,
  busy,
  onApply,
  onGoto,
}: {
  deck: Deck;
  brand?: BrandOption;
  busy: boolean;
  onApply: (text: string, slideId?: string) => void;
  onGoto: (slideId: string) => void;
}) {
  const entries = entriesFor(deck);
  const lastAgent = entries.findLastIndex((e) => e.role === 'agent');
  const slideNumber = (id?: string) => (id ? deck.slides.findIndex((s) => s.id === id) + 1 : 0);
  const waiting = deck.status === 'generating' && entries.at(-1)?.role === 'user';

  return (
    <div className="thread">
      {entries.map((e, i) =>
        e.role === 'user' ? (
          <article key={e.id} className="msg msg-user">
            {e.slideId && slideNumber(e.slideId) > 0 && (
              <button type="button" className="msg-scope link" onClick={() => onGoto(e.slideId!)}>
                About slide {slideNumber(e.slideId)}
              </button>
            )}
            <div className="bubble">{paragraphs(e.text)}</div>
            {e.brief && <BriefDetails brief={e.brief} brand={brand} />}
          </article>
        ) : (
          <AgentMessage
            key={e.id}
            entry={e}
            suggestions={i === lastAgent && e.status === 'done' && deck.status !== 'generating' ? deck.suggestions : []}
            busy={busy}
            slideNumber={slideNumber}
            onApply={(s) =>
              onApply(`Apply this suggestion: ${s.text}`, slideNumber(s.slideId) > 0 ? s.slideId : undefined)
            }
            onGoto={onGoto}
          />
        ),
      )}
      {waiting && (
        <article className="msg msg-agent" data-status="working" aria-busy="true">
          <header className="msg-head">
            <span className="agent-mark" aria-hidden="true" />
            <span className="msg-who">Agent</span>
            <span className="msg-state">Starting</span>
          </header>
          <p className="msg-wait">Reading the request…</p>
        </article>
      )}
    </div>
  );
}
