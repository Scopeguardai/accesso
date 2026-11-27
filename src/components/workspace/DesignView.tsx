'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ColourRole, DesignData } from '@/lib/brand/design';
import { useAutosize } from './Composer';
import './design.css';

const ROLES: { role: ColourRole; name: string; hint: string }[] = [
  { role: 'dark', name: 'Dark background', hint: 'Cover, section and closing slides' },
  { role: 'onDark', name: 'Text on dark', hint: 'Headlines and body on the dark background' },
  { role: 'accent', name: 'Accent', hint: 'Highlights, rules and key numbers' },
  { role: 'onAccent', name: 'Text on accent', hint: 'Text that sits on the accent colour' },
  { role: 'light', name: 'Light background', hint: 'Content slides' },
  { role: 'paper', name: 'Paper', hint: 'White panels and cards' },
  { role: 'tint', name: 'Tint', hint: 'Soft blocks behind quotes and stats' },
  { role: 'ink', name: 'Text', hint: 'Body text on light backgrounds' },
  { role: 'muted', name: 'Quiet text', hint: 'Captions, labels and page numbers' },
  { role: 'line', name: 'Lines', hint: 'Dividers and borders' },
];

/** Text and background pairs that must stay readable. */
const PAIRS: { text: ColourRole; on: ColourRole; label: string }[] = [
  { text: 'onDark', on: 'dark', label: 'Text on dark' },
  { text: 'onAccent', on: 'accent', label: 'Text on accent' },
  { text: 'ink', on: 'light', label: 'Text on light' },
  { text: 'ink', on: 'paper', label: 'Text on paper' },
  { text: 'muted', on: 'paper', label: 'Quiet text on paper' },
];

const SECTIONS = [
  ['logo', 'Logo'],
  ['colours', 'Colour palettes'],
  ['type', 'Typography'],
  ['images', 'Images'],
  ['rules', 'Brand rules'],
  ['briefs', 'Example briefs'],
] as const;

type Draft = Pick<DesignData, 'defaultPalette' | 'palettes' | 'images' | 'starters' | 'guide'>;

const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function draftOf(d: DesignData): Draft {
  return {
    defaultPalette: d.defaultPalette,
    palettes: d.palettes.map((p) => ({ ...p, colours: { ...p.colours } })),
    images: d.images.map((i) => ({ ...i })),
    starters: [...d.starters],
    guide: d.guide.trimEnd(),
  };
}

/**
 * The brand's design system: what the agent follows when it designs a deck.
 * Palette names and colours, the default palette, image notes, the brand rules
 * and the example briefs can be changed here; the logo and fonts are shown only.
 */
export default function DesignView({ design: initial }: { design: DesignData }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const guideRef = useAutosize(draft.guide);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(draftOf(saved)), [draft, saved]);
  const badColours = draft.palettes.some((p) => Object.values(p.colours).some((v) => !isHex(v)));
  const def = draft.palettes.find((p) => p.key === draft.defaultPalette) ?? draft.palettes[0];

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setStatus('idle');
    setError('');
  };

  function setColour(key: string, role: ColourRole, value: string) {
    update((d) => ({
      ...d,
      palettes: d.palettes.map((p) => (p.key === key ? { ...p, colours: { ...p.colours, [role]: value } } : p)),
    }));
  }

  async function save() {
    if (badColours) {
      setError('Fix the colours marked in red first. Write them as # and six digits, like #062C3D.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const res = await fetch(`/api/design?brand=${encodeURIComponent(saved.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultPalette: draft.defaultPalette,
          palettes: Object.fromEntries(draft.palettes.map((p) => [p.key, { label: p.label, colours: p.colours }])),
          images: draft.images.map(({ id, alt, use }) => ({ id, alt, use })),
          starters: draft.starters.map((s) => s.trim()).filter(Boolean),
          guide: draft.guide,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The changes could not be saved. Try again.');
      setSaved(data);
      setDraft(draftOf(data));
      setStatus('saved');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setStatus('idle');
    }
  }

  const fontFaces = saved.fonts
    .map(
      (f) =>
        `@font-face{font-family:"ds-${f.role}";src:url("${saved.assetBase}/${f.file}") format("truetype");font-weight:${f.weight};font-display:swap}`,
    )
    .join('');

  return (
    <div className="ds">
      <style>{fontFaces}</style>
      <nav className="ds-nav" aria-label="Design system sections">
        <p className="ds-nav-title">{saved.name}</p>
        <ul>
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#ds-${id}`}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="ds-main">
        <header className="ds-head">
          <h1>{saved.name} design system</h1>
          <p>
            What the agent follows when it designs a {saved.name} deck. Changes apply to every {saved.name} deck,
            including ones already made, the next time they are opened.
          </p>
        </header>

        <section id="ds-logo" className="ds-sec">
          <h2>Logo</h2>
          <div className="ds-logos">
            <figure className="ds-logo">
              <span className="ds-logo-tile" style={{ background: def.colours.paper, color: def.colours.ink }}>
                <span className="ds-logo-word" dangerouslySetInnerHTML={{ __html: saved.logo.wordmark }} />
              </span>
              <figcaption>Wordmark on paper</figcaption>
            </figure>
            <figure className="ds-logo">
              <span className="ds-logo-tile" style={{ background: def.colours.dark, color: def.colours.onDark }}>
                <span className="ds-logo-word" dangerouslySetInnerHTML={{ __html: saved.logo.wordmark }} />
              </span>
              <figcaption>Wordmark on dark</figcaption>
            </figure>
            <figure className="ds-logo">
              <span className="ds-logo-tile" style={{ background: def.colours.accent, color: def.colours.onAccent }}>
                <span className="ds-logo-mark" dangerouslySetInnerHTML={{ __html: saved.logo.mark }} />
              </span>
              <figcaption>Symbol on accent</figcaption>
            </figure>
          </div>
          <p className="ds-note">The logo files can&apos;t be changed here yet.</p>
        </section>

        <section id="ds-colours" className="ds-sec">
          <h2>Colour palettes</h2>
          <p className="ds-lede">
            Each deck uses one palette. The default is used when a brief doesn&apos;t ask for another.
          </p>
          {draft.palettes.map((p) => {
            const isDefault = p.key === draft.defaultPalette;
            const valid = Object.values(p.colours).every(isHex);
            const weak = valid
              ? PAIRS.map((pair) => ({ ...pair, ratio: contrast(p.colours[pair.text], p.colours[pair.on]) })).filter(
                  (pair) => pair.ratio < 4.5,
                )
              : [];
            return (
              <article key={p.key} className="ds-pal" aria-label={`${p.label} palette`}>
                <div className="ds-pal-head">
                  <label className="ds-pal-name">
                    <span className="sr-only">Palette name</span>
                    <input
                      value={p.label}
                      maxLength={60}
                      onChange={(e) =>
                        update((d) => ({
                          ...d,
                          palettes: d.palettes.map((x) => (x.key === p.key ? { ...x, label: e.target.value } : x)),
                        }))
                      }
                    />
                  </label>
                  {isDefault ? (
                    <span className="ds-badge">Default</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => update((d) => ({ ...d, defaultPalette: p.key }))}
                    >
                      Make default
                    </button>
                  )}
                </div>
                {p.source && <p className="ds-pal-source">From {p.source}</p>}

                <div className="ds-pal-body">
                  <div className="ds-swatches">
                    {ROLES.map(({ role, name, hint }) => {
                      const value = p.colours[role];
                      const ok = isHex(value);
                      return (
                        <div key={role} className="ds-sw" data-invalid={ok ? undefined : 'true'}>
                          <input
                            type="color"
                            className="ds-sw-pick"
                            value={ok ? value.toLowerCase() : '#000000'}
                            onChange={(e) => setColour(p.key, role, e.target.value.toUpperCase())}
                            aria-label={`${name} colour picker`}
                          />
                          <div className="ds-sw-text">
                            <span className="ds-sw-name" title={hint}>
                              {name}
                            </span>
                            <input
                              className="ds-sw-hex"
                              value={value}
                              maxLength={7}
                              spellCheck={false}
                              aria-label={`${name}, colour code`}
                              aria-invalid={!ok}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setColour(p.key, role, (v.startsWith('#') ? v : `#${v}`).toUpperCase());
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {valid && (
                    <div className="ds-preview" aria-hidden="true">
                      <div
                        className="ds-preview-dark"
                        style={{ background: p.colours.dark, color: p.colours.onDark }}
                      >
                        <span className="ds-preview-kicker" style={{ color: p.colours.accent }}>
                          {saved.tagline}
                        </span>
                        <span className="ds-preview-title">One idea per slide</span>
                      </div>
                      <div
                        className="ds-preview-light"
                        style={{ background: p.colours.light, color: p.colours.ink }}
                      >
                        <span className="ds-preview-num" style={{ background: p.colours.tint }}>
                          <b style={{ color: p.colours.ink }}>42</b>
                          <i style={{ color: p.colours.muted }}>sites</i>
                        </span>
                        <span className="ds-preview-rule" style={{ background: p.colours.accent }} />
                        <span className="ds-preview-body" style={{ borderColor: p.colours.line }}>
                          Body text on the light background
                        </span>
                        <span className="ds-preview-chip" style={{ background: p.colours.accent, color: p.colours.onAccent }}>
                          Accent
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {weak.length > 0 && (
                  <p className="ds-warn">
                    May be hard to read:{' '}
                    {weak.map((w, i) => (
                      <span key={w.label}>
                        {i > 0 && ', '}
                        {w.label.toLowerCase()} ({w.ratio.toFixed(1)}:1)
                      </span>
                    ))}
                    . Aim for at least 4.5:1.
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <section id="ds-type" className="ds-sec">
          <h2>Typography</h2>
          <div className="ds-fonts">
            {saved.fonts.map((f) => (
              <div key={f.role} className="ds-font">
                <p className="ds-font-sample" style={{ fontFamily: `"ds-${f.role}", ${f.role === 'mono' ? 'monospace' : 'sans-serif'}` }}>
                  {f.role === 'sans' ? 'Clarity, sustainability and control' : saved.tagline}
                </p>
                <p className="ds-font-meta">
                  <b>{f.family}</b> {f.role === 'sans' ? 'for headlines and body text' : 'for small labels, captions and page numbers'}
                </p>
              </div>
            ))}
          </div>
          <p className="ds-note">The fonts can&apos;t be changed here yet. How they are used is set in the brand rules below.</p>
        </section>

        <section id="ds-images" className="ds-sec">
          <h2>Images</h2>
          <p className="ds-lede">The agent picks images by these notes, so say plainly what each shows and when to use it.</p>
          <div className="ds-images">
            {draft.images.map((img) => (
              <figure key={img.id} className="ds-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${saved.assetBase}/${img.file}`} alt={img.alt} loading="lazy" />
                <figcaption>
                  <label>
                    <span>What it shows</span>
                    <input
                      value={img.alt}
                      maxLength={200}
                      onChange={(e) =>
                        update((d) => ({
                          ...d,
                          images: d.images.map((x) => (x.id === img.id ? { ...x, alt: e.target.value } : x)),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>When to use it</span>
                    <textarea
                      rows={2}
                      value={img.use}
                      maxLength={300}
                      onChange={(e) =>
                        update((d) => ({
                          ...d,
                          images: d.images.map((x) => (x.id === img.id ? { ...x, use: e.target.value } : x)),
                        }))
                      }
                    />
                  </label>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="ds-rules" className="ds-sec">
          <h2>Brand rules</h2>
          <p className="ds-lede">
            The agent reads these before it designs every deck: voice, typography, colour, layout and imagery. Write
            them as plain rules.
          </p>
          <textarea
            ref={guideRef}
            className="ds-guide"
            value={draft.guide}
            spellCheck
            aria-label="Brand rules"
            onChange={(e) => update((d) => ({ ...d, guide: e.target.value }))}
          />
        </section>

        <section id="ds-briefs" className="ds-sec">
          <h2>Example briefs</h2>
          <p className="ds-lede">Shown on the home page as starting points for a new deck. Up to eight.</p>
          <ol className="ds-briefs">
            {draft.starters.map((s, i) => (
              <li key={i}>
                <textarea
                  rows={2}
                  value={s}
                  maxLength={400}
                  aria-label={`Example brief ${i + 1}`}
                  onChange={(e) =>
                    update((d) => ({ ...d, starters: d.starters.map((x, j) => (j === i ? e.target.value : x)) }))
                  }
                />
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => update((d) => ({ ...d, starters: d.starters.filter((_, j) => j !== i) }))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
          {draft.starters.length < 8 && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => update((d) => ({ ...d, starters: [...d.starters, ''] }))}
            >
              Add an example
            </button>
          )}
        </section>
      </div>

      {(dirty || status === 'saved' || error) && (
        <div className="ds-bar" role="region" aria-label="Save changes">
          <p role="status">
            {error ? <span className="ds-bar-error">{error}</span> : dirty ? 'You have unsaved changes.' : 'Changes saved.'}
          </p>
          {dirty && (
            <div className="ds-bar-actions">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => {
                  setDraft(draftOf(saved));
                  setError('');
                }}
                disabled={status === 'saving'}
              >
                Discard
              </button>
              <button type="button" className="btn-ink" onClick={save} aria-busy={status === 'saving'}>
                {status === 'saving' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
