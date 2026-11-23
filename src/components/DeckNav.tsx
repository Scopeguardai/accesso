'use client';

import { useEffect, useState } from 'react';

/**
 * Paging for the deck page: arrow keys and space on desktop, a slide counter,
 * and messages to a parent frame (the studio) saying which slide is in view.
 * On phones the deck is an ordinary scrolling page and needs none of this.
 */
export default function DeckNav({ count }: { count: number }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const deck = document.querySelector<HTMLElement>('.deck');
    if (!deck) return;
    const slides = Array.from(deck.querySelectorAll<HTMLElement>('.slide'));
    if (slides.length === 0) return;

    let index = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          index = slides.indexOf(entry.target as HTMLElement);
          setCurrent(index);
          const id = slides[index].id;
          history.replaceState(null, '', `#${id}`);
          window.parent?.postMessage({ type: 'accesso:slide', id, index }, window.location.origin);
        }
      },
      { threshold: 0.55 },
    );
    slides.forEach((s) => observer.observe(s));

    const go = (to: number) =>
      slides[Math.max(0, Math.min(slides.length - 1, to))].scrollIntoView({ behavior: 'smooth', block: 'start' });

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) go(index + 1);
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) go(index - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(slides.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
    };
  }, [count]);

  if (count === 0) return null;
  return (
    <div className="deck-progress" role="progressbar" aria-valuemin={1} aria-valuemax={count} aria-valuenow={current + 1}>
      <span style={{ width: `${((current + 1) / count) * 100}%` }} />
    </div>
  );
}
