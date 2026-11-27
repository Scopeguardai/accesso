'use client';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { Brief } from '@/lib/deck/schema';
import type { BrandOption } from '@/lib/workspace';
import PalettePicker from './PalettePicker';
import { submitOnEnter, useAutosize } from './Composer';
import { IconChevron } from './icons';

const MIN_SLIDES = 3;
const MAX_SLIDES = 20;

/**
 * The home screen's brief: what the deck is about, who it is for and what it
 * should achieve, plus its length, palette and tone. `children` (the person's
 * own presentations) sit between the brief and the example briefs, so returning
 * people see their work before the examples.
 */
export default function NewDeck({
  brand,
  knowledgeCount,
  busy,
  error,
  onCreate,
  children,
}: {
  brand: BrandOption;
  knowledgeCount: number;
  busy: boolean;
  error: string;
  onCreate: (brief: Brief) => void;
  children?: ReactNode;
}) {
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [slideCount, setSlideCount] = useState(8);
  const [palette, setPalette] = useState('');
  const [toneOpen, setToneOpen] = useState(false);
  const [tone, setTone] = useState('');
  const [nudge, setNudge] = useState(false);
  const ref = useAutosize(prompt);

  const drafts = brand.knowledge.filter((k) => k.status === 'draft').length;
  const hasDecks = Boolean(children);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (prompt.trim().length < 3) {
      setNudge(true);
      ref.current?.focus();
      return;
    }
    onCreate({
      prompt: prompt.trim(),
      slideCount,
      palette: palette || undefined,
      audience: audience.trim(),
      goal: goal.trim(),
      tone: tone.trim(),
    });
  }

  function applyExample(text: string) {
    setPrompt(text);
    setNudge(false);
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => el.setSelectionRange(text.length, text.length));
  }

  const steps = (delta: number) =>
    setSlideCount((n) => Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, n + delta)));

  return (
    <div className="new">
      <div className="new-inner">
        <h1 className="new-title">What are we presenting?</h1>
        <p className="new-context">
          Built in the {brand.name} brand from{' '}
          <Link href="/knowledge">
            {knowledgeCount === 1 ? '1 knowledge entry' : `${knowledgeCount} knowledge entries`}
          </Link>
          {drafts > 0 && (drafts === knowledgeCount ? ', all still drafts' : `, ${drafts} still drafts`)}.
        </p>

        <form className="composer composer-new" onSubmit={submit} aria-label="New presentation" noValidate>
          {error && (
            <p className="composer-error" role="alert">
              {error}
            </p>
          )}
          <div className="composer-box">
            <textarea
              ref={ref}
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (nudge) setNudge(false);
              }}
              onKeyDown={submitOnEnter}
              maxLength={4000}
              aria-label="What the presentation is about"
              aria-describedby={nudge ? 'brief-nudge' : undefined}
              placeholder="What it's about, and anything it must say"
              autoFocus
            />

            <div className="brief-fields">
              <label className="brief-field">
                <span>For</span>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  maxLength={200}
                  placeholder="Who will see it"
                />
              </label>
              <label className="brief-field">
                <span>Goal</span>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={300}
                  placeholder="What they should do afterwards"
                />
              </label>
            </div>

            {toneOpen && (
              <div className="brief-fields brief-fields-tone">
                <label className="brief-field">
                  <span>Tone</span>
                  <input
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    maxLength={120}
                    placeholder={`Leave empty for the ${brand.name} voice`}
                    autoFocus
                  />
                </label>
              </div>
            )}

            <div className="composer-row">
              <div className="composer-params">
                <div className="chip stepper" role="group" aria-label="Number of slides">
                  <button
                    type="button"
                    onClick={() => steps(-1)}
                    aria-label="Fewer slides"
                    disabled={slideCount <= MIN_SLIDES}
                  >
                    −
                  </button>
                  <output aria-live="polite">
                    <b>{slideCount}</b> slides
                  </output>
                  <button
                    type="button"
                    onClick={() => steps(1)}
                    aria-label="More slides"
                    disabled={slideCount >= MAX_SLIDES}
                  >
                    +
                  </button>
                </div>
                <PalettePicker palettes={brand.palettes} value={palette} onChange={setPalette} allowAuto />
                <button
                  type="button"
                  className="chip"
                  aria-expanded={toneOpen}
                  onClick={() => setToneOpen((o) => !o)}
                >
                  Tone
                  <IconChevron width={16} height={16} className="chev" />
                </button>
              </div>
              <div className="create">
                <span className="create-hint" aria-hidden="true">
                  Enter to create
                </span>
                <button type="submit" className="create-btn" aria-busy={busy}>
                  {busy ? 'Starting…' : 'Create deck'}
                </button>
              </div>
            </div>
          </div>
          {nudge && (
            <p className="brief-nudge" id="brief-nudge" role="status">
              Say what the deck is about first. A sentence is enough.
            </p>
          )}
        </form>

        {children}

        {brand.starters.length > 0 && (
          <section className="starters" aria-label="Example briefs">
            <h2 className="new-h2">{hasDecks ? 'Or start from an example' : 'Start from an example'}</h2>
            <ul>
              {brand.starters.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => applyExample(s)}>
                    <span className="starter-text">{s}</span>
                    <span className="starter-use" aria-hidden="true">
                      Use
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
