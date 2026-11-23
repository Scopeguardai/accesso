'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Deck } from '@/lib/deck/schema';

/**
 * The working view of one deck: live preview on the left; on the right the
 * prompt box for content and design changes, the agent's suggestions and a
 * log of what it has done.
 */
export default function Studio({ initial }: { initial: Deck }) {
  const [deck, setDeck] = useState(initial);
  const [inView, setInView] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [onlyThis, setOnlyThis] = useState(false);
  const [request, setRequest] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const shown = useRef(initial.updatedAt);
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  const working = deck.status === 'generating' || sending;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/decks/${initial.id}`, { cache: 'no-store' });
    if (!res.ok) return;
    const next: Deck = await res.json();
    setDeck(next);
    // Reload the preview only when the slides themselves may have changed.
    const stamp = JSON.stringify([next.slides, next.palette]);
    if (stamp !== shown.current) {
      shown.current = stamp;
      const hash = inViewRef.current ? `#${inViewRef.current}` : '';
      frame.current?.contentWindow?.location.replace(`/d/${initial.id}${hash}`);
    }
  }, [initial.id]);

  useEffect(() => {
    shown.current = JSON.stringify([initial.slides, initial.palette]);
  }, [initial]);

  useEffect(() => {
    if (deck.status !== 'generating') return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [deck.status, refresh]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'accesso:slide' && typeof e.data.id === 'string') setInView(e.data.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function send(text: string, slideId?: string) {
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/decks/${deck.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request: text, slideId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send the request.');
      setRequest('');
      setDeck((d) => ({ ...d, status: 'generating' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (request.trim().length < 2) return;
    void send(request.trim(), onlyThis && inView ? inView : undefined);
  }

  const position = inView ? deck.slides.findIndex((s) => s.id === inView) + 1 : 0;
  const recent = deck.activity.slice(-6).reverse();

  return (
    <div className="studio">
      <div className="studio-preview">
        <iframe ref={frame} src={`/d/${deck.id}`} title={`Preview of ${deck.title}`} />
      </div>
      <aside className="panel">
        <div>
          <h3>Presentation</h3>
          <p>
            <strong>{deck.title}</strong>
          </p>
          <p className="note">
            {deck.slides.length} slides · {deck.palette} palette{' '}
            <span className={`chip ${deck.status}`}>{deck.status === 'generating' ? 'working' : deck.status}</span>
          </p>
          {deck.statusNote && <p className={deck.status === 'error' ? 'error' : 'note'}>{deck.statusNote}</p>}
        </div>

        <form onSubmit={submit}>
          <h3>Change something</h3>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Content or design, in plain words. e.g. “Shorten the opening and lead with the positioning line” or “Use the forest palette and swap the image on this slide.”"
            aria-label="What should change"
            maxLength={2000}
            disabled={working}
          />
          <label className="target">
            <input
              type="checkbox"
              checked={onlyThis}
              onChange={(e) => setOnlyThis(e.target.checked)}
              disabled={!inView || working}
            />
            Only the slide in view{position > 0 ? ` (slide ${position})` : ''}
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={working || request.trim().length < 2}>
            {deck.status === 'generating' ? 'Working…' : 'Apply change'}
          </button>
        </form>

        {deck.suggestions.length > 0 && (
          <div>
            <h3>Suggestions from the agent</h3>
            <ul className="suggestions">
              {deck.suggestions.map((s, i) => {
                const n = s.slideId ? deck.slides.findIndex((x) => x.id === s.slideId) + 1 : 0;
                return (
                  <li key={i}>
                    <span className="kind">
                      {s.kind}
                      {n > 0 ? ` · slide ${n}` : ''}
                    </span>
                    <span>{s.text}</span>
                    <span>
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={working}
                        onClick={() => send(`Apply this suggestion: ${s.text}`, n > 0 ? s.slideId : undefined)}
                      >
                        Apply
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <h3>Activity</h3>
            <ul className="activity">
              {recent.map((a, i) => (
                <li key={`${a.at}-${i}`}>{a.text}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
