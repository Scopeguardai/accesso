'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { slideName } from '@/lib/deck/describe';
import type { Deck } from '@/lib/deck/schema';
import type { BrandOption } from '@/lib/workspace';
import { IconCheck, IconDesktop, IconExternal, IconFocus, IconLink, IconPhone, IconUnfocus } from './icons';

/** The size the deck page is rendered at before being scaled to fit the column. */
const BASE = { desktop: { w: 1280, h: 720 }, phone: { w: 390, h: 844 } } as const;

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Some browsers refuse clipboard access; fall back to a hidden field.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Shown before a deck exists: the brand the new deck will be built in. */
function BrandBoard({ brand }: { brand: BrandOption }) {
  const main = brand.palettes.find((p) => p.key === brand.defaultPalette) ?? brand.palettes[0];
  return (
    <div className="pv">
      <div className="pv-stage pv-stage-empty">
        <div className="board">
          <div className="board-cover" style={{ background: main.dark, color: main.accent }}>
            <span className="board-mark" dangerouslySetInnerHTML={{ __html: brand.wordmarkSvg }} />
          </div>
          <ul className="board-palettes" aria-label={`${brand.name} palettes`}>
            {brand.palettes.map((p) => (
              <li key={p.key}>
                <span className="board-chip" aria-hidden="true">
                  <span style={{ background: p.dark }} />
                  <span style={{ background: p.accent }} />
                  <span style={{ background: p.light }} />
                </span>
                <span>{p.label.replace(/\s*\(.*\)$/, '')}</span>
              </li>
            ))}
          </ul>
          <p className="board-note">Your presentation is built here, slide by slide, in the {brand.name} style.</p>
        </div>
      </div>
    </div>
  );
}

export default function Preview({
  deck,
  brand,
  frameRef,
  inView,
  onInView,
  onGoto,
  focused = false,
  onToggleFocus,
}: {
  deck: Deck | null;
  brand?: BrandOption;
  frameRef: RefObject<HTMLIFrameElement | null>;
  inView: string | null;
  onInView: (id: string) => void;
  onGoto: (id: string) => void;
  /** Whether the other columns are collapsed, and how to toggle that. */
  focused?: boolean;
  onToggleFocus?: () => void;
}) {
  const [mode, setMode] = useState<'desktop' | 'phone'>('desktop');
  // On a phone, show the deck as a phone would by default.
  useEffect(() => {
    if (window.matchMedia('(max-width: 820px)').matches) setMode('phone');
  }, []);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const stage = useRef<HTMLDivElement>(null);
  const size = useSize(stage);
  const loaded = useRef('');
  const reloads = useRef(0);
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  // Which slide the preview is showing, reported by the deck page.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === 'accesso:slide' && typeof e.data.id === 'string') onInView(e.data.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameRef, onInView]);

  // Reload the page when the slides or palette change, staying on the same slide.
  const version = deck ? JSON.stringify([deck.slides, deck.palette]) : '';
  useEffect(() => {
    if (!deck) return;
    if (!loaded.current) {
      loaded.current = version;
      return;
    }
    if (loaded.current === version) return;
    loaded.current = version;
    // A new query string forces a real reload; changing only the #slide part would not.
    reloads.current += 1;
    const hash = inViewRef.current ? `#${inViewRef.current}` : '';
    frameRef.current?.contentWindow?.location.replace(`/d/${deck.id}?v=${reloads.current}${hash}`);
  }, [deck, version, frameRef]);

  if (!deck) return brand ? <BrandBoard brand={brand} /> : null;

  const base = BASE[mode];
  const pad = mode === 'phone' ? 32 : 40;
  const scale =
    size.w > 0 ? Math.min((size.w - pad) / base.w, (size.h - pad) / base.h, mode === 'phone' ? 1 : Infinity) : 0;
  const index = inView ? deck.slides.findIndex((s) => s.id === inView) : -1;
  const url = `/d/${deck.id}`;

  async function copy() {
    const ok = await copyText(`${window.location.origin}${url}`);
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied('idle'), 2200);
  }

  return (
    <div className="pv">
      <div className="pv-bar">
        <div className="seg" role="group" aria-label="Preview size">
          <button type="button" aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')}>
            <IconDesktop />
            Desktop
          </button>
          <button type="button" aria-pressed={mode === 'phone'} onClick={() => setMode('phone')}>
            <IconPhone />
            Phone
          </button>
        </div>
        <span className="grow" />
        {onToggleFocus && (
          <button
            type="button"
            className="btn-quiet pv-focus"
            onClick={onToggleFocus}
            aria-pressed={focused}
            title={focused ? 'Show the projects and conversation again' : 'Collapse the other columns'}
          >
            {focused ? <IconUnfocus /> : <IconFocus />}
            <span className="label-long">{focused ? 'Show all' : 'Focus'}</span>
          </button>
        )}
        <button type="button" className="btn-quiet" onClick={copy} aria-live="polite">
          {copied === 'ok' ? <IconCheck /> : <IconLink />}
          <span className="label-long">
            {copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy failed' : 'Copy link'}
          </span>
          <span className="label-short">{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Failed' : 'Link'}</span>
        </button>
        <a className="btn-quiet" href={url} target="_blank" rel="noreferrer">
          <IconExternal />
          Open
        </a>
      </div>

      <div className="pv-stage" ref={stage}>
        <div
          className="pv-frame"
          data-mode={mode}
          style={{ width: base.w * scale, height: base.h * scale, visibility: scale ? 'visible' : 'hidden' }}
        >
          <iframe
            ref={frameRef}
            src={url}
            title={`Preview of ${deck.title}`}
            style={{ width: base.w, height: base.h, transform: `scale(${scale})` }}
          />
        </div>
        {deck.slides.length === 0 && deck.status === 'generating' && (
          <p className="pv-waiting">The first slides appear here as the agent writes them.</p>
        )}
      </div>

      {deck.slides.length > 0 && (
        <nav className="pv-strip" aria-label="Slides">
          <ol>
            {deck.slides.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => onGoto(s.id)}
                  title={slideName(s)}
                >
                  <span className="pv-n">{i + 1}</span>
                  <span className="pv-name">{slideName(s)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
