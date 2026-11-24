'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { slideName } from '@/lib/deck/describe';
import type { Deck } from '@/lib/deck/schema';
import type { BrandOption } from '@/lib/workspace';
import PalettePicker from './PalettePicker';
import { IconSend } from './icons';

/** Grow a textarea with its content, up to the CSS max-height. */
export function useAutosize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // A hidden box (in a collapsed column) measures 0; leave it at its natural height until it is shown.
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

/** Enter sends, Shift+Enter adds a line. */
export function submitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

/**
 * The message box for an existing deck. Besides the request itself it
 * carries the parameters of a change: whether it applies to the whole deck
 * or to the slide in view, and the palette, which switches immediately.
 */
export default function Composer({
  deck,
  brand,
  inView,
  busy,
  error,
  onSend,
  onPalette,
}: {
  deck: Deck;
  brand?: BrandOption;
  inView: string | null;
  busy: boolean;
  error: string;
  onSend: (text: string, slideId?: string) => Promise<boolean>;
  onPalette: (key: string) => void;
}) {
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'deck' | 'slide'>('deck');
  const ref = useAutosize(text);

  const index = inView ? deck.slides.findIndex((s) => s.id === inView) : -1;
  const slide = index >= 0 ? deck.slides[index] : undefined;
  const target = scope === 'slide' && slide ? slide.id : undefined;
  const canSend = !busy && text.trim().length >= 2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    if (await onSend(text.trim(), target)) setText('');
  }

  return (
    <form className="composer" onSubmit={submit} aria-label="Ask for a change">
      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}
      <div className="composer-box">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={submitOnEnter}
          maxLength={2000}
          aria-label="What should change"
          placeholder={
            target ? `What should change on slide ${index + 1}?` : 'Ask for a change to the content or the design'
          }
        />
        <div className="composer-row">
          <div className="composer-params">
            <div className="seg" role="group" aria-label="Apply to">
              <button type="button" aria-pressed={scope === 'deck'} onClick={() => setScope('deck')}>
                Whole deck
              </button>
              <button
                type="button"
                aria-pressed={scope === 'slide'}
                onClick={() => setScope('slide')}
                disabled={!slide}
                title={slide ? slideName(slide) : 'Scroll the preview to a slide first'}
              >
                {slide ? `Slide ${index + 1}` : 'This slide'}
              </button>
            </div>
            {brand && (
              <PalettePicker palettes={brand.palettes} value={deck.palette} onChange={onPalette} disabled={busy} />
            )}
          </div>
          <button type="submit" className="send" disabled={!canSend} aria-label="Send">
            <IconSend />
          </button>
        </div>
      </div>
      {(busy || (target && slide)) && (
        <p className="composer-hint">
          {busy
            ? 'The agent is working. You can send the next change when it finishes.'
            : `Changes apply to “${slide ? slideName(slide) : ''}” only.`}
        </p>
      )}
    </form>
  );
}
