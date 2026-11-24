'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { slideName } from '@/lib/deck/describe';
import type { Deck } from '@/lib/deck/schema';

/** The size the deck page is rendered at before being scaled to fit the canvas. */
const BASE = { desktop: { w: 1280, h: 720 }, phone: { w: 390, h: 844 } } as const;
export type PreviewMode = keyof typeof BASE;

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

/** The live presentation, scaled to fill the canvas, with the list of slides under it. */
export default function Preview({
  deck,
  mode,
  frameRef,
  inView,
  onInView,
  onGoto,
}: {
  deck: Deck;
  mode: PreviewMode;
  frameRef: RefObject<HTMLIFrameElement | null>;
  inView: string | null;
  onInView: (id: string) => void;
  onGoto: (id: string) => void;
}) {
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
  const version = JSON.stringify([deck.slides, deck.palette]);
  useEffect(() => {
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
  }, [deck.id, version, frameRef]);

  const base = BASE[mode];
  // Twice the page gutter (16px), so the deck sits the same distance from every edge.
  const pad = 32;
  const scale =
    size.w > 0 ? Math.min((size.w - pad) / base.w, (size.h - pad) / base.h, mode === 'phone' ? 1 : Infinity) : 0;
  const index = inView ? deck.slides.findIndex((s) => s.id === inView) : -1;

  return (
    <div className="pv">
      <div className="pv-stage" ref={stage}>
        <div
          className="pv-frame"
          data-mode={mode}
          style={{ width: base.w * scale, height: base.h * scale, visibility: scale > 0 ? 'visible' : 'hidden' }}
        >
          <iframe
            ref={frameRef}
            src={`/d/${deck.id}`}
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
