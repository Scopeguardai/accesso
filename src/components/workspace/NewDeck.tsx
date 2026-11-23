'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Brief } from '@/lib/deck/schema';
import type { BrandOption } from '@/lib/workspace';
import PalettePicker from './PalettePicker';
import { submitOnEnter, useAutosize } from './Composer';
import { IconChevron, IconSend } from './icons';

/**
 * The opening screen of a new project: one prompt plus the parameters
 * of the deck, with the brand's knowledge base and example briefs beside it.
 */
export default function NewDeck({
  brand,
  busy,
  error,
  onCreate,
}: {
  brand: BrandOption;
  busy: boolean;
  error: string;
  onCreate: (brief: Brief) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [slideCount, setSlideCount] = useState(8);
  const [palette, setPalette] = useState('');
  const [more, setMore] = useState(false);
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [tone, setTone] = useState('');
  const ref = useAutosize(prompt);
  const canSend = !busy && prompt.trim().length >= 3;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    onCreate({
      prompt: prompt.trim(),
      slideCount: Math.min(20, Math.max(3, slideCount || 8)),
      palette: palette || undefined,
      audience: audience.trim(),
      goal: goal.trim(),
      tone: tone.trim(),
    });
  }

  const drafts = brand.knowledge.filter((k) => k.status !== 'verified').length;

  return (
    <div className="new">
      <div className="new-inner">
        <h1 className="new-title">What are we presenting?</h1>
        <p className="new-lede">
          Describe it in your own words. The agent plans the story from the {brand.name} knowledge base, designs it in
          the {brand.name} style and builds it in the preview as it goes.
        </p>

        <form className="composer composer-new" onSubmit={submit} aria-label="New presentation">
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
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={submitOnEnter}
              maxLength={4000}
              aria-label="Describe the presentation"
              placeholder="What it's about, who it's for, and anything it must say"
              autoFocus
            />
            <div className="composer-row">
              <div className="composer-params">
                <label className="chip chip-field">
                  <span>Slides</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                  />
                </label>
                <PalettePicker palettes={brand.palettes} value={palette} onChange={setPalette} allowAuto />
                <button
                  type="button"
                  className="chip"
                  aria-expanded={more}
                  aria-controls="brief-more"
                  onClick={() => setMore((m) => !m)}
                >
                  <span className="label-long">Audience, goal and tone</span>
                  <span className="label-short">Details</span>
                  <IconChevron width={16} height={16} className="chev" />
                </button>
              </div>
              <button type="submit" className="send" disabled={!canSend} aria-label="Create presentation">
                <IconSend />
              </button>
            </div>
            {more && (
              <div className="brief-more" id="brief-more">
                <label>
                  <span>Audience</span>
                  <input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    maxLength={200}
                    placeholder="Who will see it"
                  />
                </label>
                <label>
                  <span>Goal</span>
                  <input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    maxLength={300}
                    placeholder="What they should think or do afterwards"
                  />
                </label>
                <label>
                  <span>Tone</span>
                  <input
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    maxLength={120}
                    placeholder="Leave empty for the brand voice"
                  />
                </label>
              </div>
            )}
          </div>
        </form>

        {brand.starters.length > 0 && (
          <section className="starters" aria-label="Example briefs">
            <h2 className="new-h2">Start from an example</h2>
            <ul>
              {brand.starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(s);
                      ref.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="kb">
          <summary>
            <span className="new-h2">Knowledge the agent can use</span>
            <span className="kb-count">
              {brand.knowledge.length} {brand.knowledge.length === 1 ? 'file' : 'files'}
              {drafts > 0 && `, ${drafts} not yet verified`}
            </span>
          </summary>
          <ul>
            {brand.knowledge.map((k) => (
              <li key={k.path}>
                <span>{k.title}</span>
                <span className="kb-status" data-status={k.status || 'unknown'}>
                  {k.status === 'verified' ? 'Verified' : 'Draft'}
                </span>
              </li>
            ))}
          </ul>
          <p className="kb-note">
            <Link href="/knowledge" className="link">
              Open the knowledge base
            </Link>{' '}
            to add or check what the agent can use.
          </p>
        </details>
      </div>
    </div>
  );
}
