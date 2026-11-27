'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { cssFontFormat, MAX_IMAGES, MAX_PALETTES } from '@/lib/brand/assets';
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

/** A button that opens the file chooser. The file is handed over as soon as it is chosen. */
function FileButton({
  label,
  accept,
  busy,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  busy?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className="btn-quiet ds-file" aria-busy={busy} data-disabled={busy || disabled ? 'true' : undefined}>
      {busy ? 'Uploading…' : label}
      <input
        type="file"
        accept={accept}
        disabled={busy || disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

/** "SpaceMono-Regular.ttf" becomes "Space Mono". */
function familyFromFile(name: string) {
  const stem = name.replace(/\.[^.]+$/, '').split(/[-_]/)[0] ?? '';
  return stem.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function weightFromFile(name: string) {
  const n = name.toLowerCase();
  if (/variable|\bvf\b|\[wght\]/.test(n)) return '100 900';
  if (/bold/.test(n)) return '700';
  if (/medium/.test(n)) return '500';
  if (/light/.test(n)) return '300';
  return '400';
}

const decks = (n: number) => (n === 1 ? '1 deck' : `${n} decks`);

/**
 * The brand's design system: what the agent follows when it designs a deck.
 * Colours, image notes, the brand rules and the example briefs are edited on
 * the page and saved together. Logo, font and image files are uploaded or
 * removed one at a time, and those changes are saved straight away.
 */
export default function DesignView({ design: initial }: { design: DesignData }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ where: string; text: string; tone: 'ok' | 'error' } | null>(null);
  const [fontForm, setFontForm] = useState<{ role: 'sans' | 'mono'; file: File; family: string; weight: string } | null>(
    null,
  );
  const [imageForm, setImageForm] = useState<{ file: File; alt: string; use: string } | null>(null);
  const [confirmImage, setConfirmImage] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [assetVersion, setAssetVersion] = useState(0);
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

  function addPalette() {
    const taken = new Set([...draft.palettes, ...saved.palettes].map((p) => p.key));
    let n = 1;
    while (taken.has(`custom-${n}`)) n += 1;
    const key = `custom-${n}`;
    const base = def;
    setJustAdded(key);
    update((d) => ({
      ...d,
      palettes: [...d.palettes, { key, label: 'New palette', colours: { ...base.colours }, usedBy: 0 }],
    }));
  }

  /** Take the server's logo, fonts and image list after an upload, keeping any unsaved edits on the page. */
  function syncAssets(data: DesignData) {
    setSaved(data);
    setDraft((d) => ({
      ...d,
      images: [
        ...d.images.filter((x) => data.images.some((i) => i.id === x.id)),
        ...data.images.filter((i) => !d.images.some((x) => x.id === i.id)).map((i) => ({ ...i })),
      ],
    }));
    setAssetVersion((v) => v + 1);
    router.refresh();
  }

  async function upload(where: string, done: string, fields: Record<string, string | File>): Promise<boolean> {
    setBusy(where);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('brand', saved.id);
      for (const [k, v] of Object.entries(fields)) form.set(k, v);
      const res = await fetch('/api/design/asset', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The upload did not work. Try again.');
      syncAssets(data);
      setNotice({ where, text: done, tone: 'ok' });
      return true;
    } catch (err) {
      setNotice({ where, text: (err as Error).message, tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitFont(e: FormEvent) {
    e.preventDefault();
    if (!fontForm) return;
    const where = `font-${fontForm.role}`;
    if (!fontForm.family.trim()) {
      setNotice({ where, text: 'Give the font a name first, like Inter.', tone: 'error' });
      return;
    }
    const ok = await upload(where, `${fontForm.family.trim()} is now in use.`, {
      kind: where,
      file: fontForm.file,
      family: fontForm.family,
      weight: fontForm.weight,
    });
    if (ok) setFontForm(null);
  }

  async function submitImage(e: FormEvent) {
    e.preventDefault();
    if (!imageForm) return;
    if (!imageForm.alt.trim()) {
      setNotice({ where: 'image', text: 'Say what the image shows first. The agent chooses images by it.', tone: 'error' });
      return;
    }
    const ok = await upload('image', 'Image added.', {
      kind: 'image',
      file: imageForm.file,
      alt: imageForm.alt,
      use: imageForm.use,
    });
    if (ok) setImageForm(null);
  }

  async function removeImage(id: string) {
    setBusy(`remove-${id}`);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/design/asset?brand=${encodeURIComponent(saved.id)}&image=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The image could not be removed. Try again.');
      syncAssets(data);
      setConfirmImage(null);
      setNotice({ where: 'image', text: 'Image removed.', tone: 'ok' });
    } catch (err) {
      setNotice({ where: 'image', text: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const note = (where: string) =>
    notice?.where === where ? (
      <p className="ds-msg" data-tone={notice.tone} role="status">
        {notice.text}
      </p>
    ) : null;

  const removedInUse = saved.palettes.filter((p) => p.usedBy > 0 && !draft.palettes.some((d) => d.key === p.key));

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
        `@font-face{font-family:"ds-${f.role}";src:url("${saved.assetBase}/${f.file}${assetVersion ? `?v=${assetVersion}` : ''}") format("${cssFontFormat(f.file)}");font-weight:${f.weight};font-display:swap}`,
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
          <div className="ds-actions">
            <FileButton
              label="Replace wordmark"
              accept=".svg,image/svg+xml"
              busy={busy === 'wordmark'}
              onFile={(file) => upload('wordmark', 'Wordmark replaced.', { kind: 'wordmark', file })}
            />
            <FileButton
              label="Replace symbol"
              accept=".svg,image/svg+xml"
              busy={busy === 'mark'}
              onFile={(file) => upload('mark', 'Symbol replaced.', { kind: 'mark', file })}
            />
          </div>
          {note('wordmark')}
          {note('mark')}
          <p className="ds-note">
            Upload SVG files. A logo with no colour of its own takes its colour from the slide, so one file works on
            every background. Uploads are saved straight away.
          </p>
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
                      autoFocus={p.key === justAdded}
                      onFocus={(e) => p.key === justAdded && e.currentTarget.select()}
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
                    <>
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => update((d) => ({ ...d, defaultPalette: p.key }))}
                      >
                        Make default
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        aria-label={`Remove the ${p.label} palette`}
                        onClick={() => update((d) => ({ ...d, palettes: d.palettes.filter((x) => x.key !== p.key) }))}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
                {(p.source || p.usedBy > 0) && (
                  <p className="ds-pal-source">
                    {p.source && <span>From {p.source}</span>}
                    {p.usedBy > 0 && <span>Used by {decks(p.usedBy)}</span>}
                  </p>
                )}

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
          {removedInUse.length > 0 && (
            <p className="ds-warn">
              {removedInUse.map((p) => `${p.label} is used by ${decks(p.usedBy)}`).join('. ')}. They switch to the
              default palette when you save.
            </p>
          )}
          <div className="ds-actions">
            <button
              type="button"
              className="btn-quiet"
              onClick={addPalette}
              disabled={draft.palettes.length >= MAX_PALETTES}
            >
              Add a palette
            </button>
            {draft.palettes.length >= MAX_PALETTES && (
              <span className="ds-limit">A brand holds up to {MAX_PALETTES} palettes.</span>
            )}
          </div>
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
                {fontForm?.role === f.role ? (
                  <form className="ds-add" onSubmit={submitFont} noValidate>
                    <p className="ds-add-file">{fontForm.file.name}</p>
                    <label>
                      <span>Font name</span>
                      <input
                        value={fontForm.family}
                        maxLength={60}
                        autoFocus
                        onChange={(e) => setFontForm({ ...fontForm, family: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Weight: one number, or a range for a variable font</span>
                      <input
                        value={fontForm.weight}
                        maxLength={7}
                        placeholder="400 or 100 900"
                        onChange={(e) => setFontForm({ ...fontForm, weight: e.target.value })}
                      />
                    </label>
                    <div className="ds-add-actions">
                      <button type="submit" className="btn-ink" disabled={busy === `font-${f.role}`}>
                        {busy === `font-${f.role}` ? 'Uploading…' : 'Use this font'}
                      </button>
                      <button type="button" className="btn-quiet" onClick={() => setFontForm(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="ds-actions">
                    <FileButton
                      label="Replace font"
                      accept=".ttf,.otf,.woff,.woff2"
                      onFile={(file) => {
                        setNotice(null);
                        setFontForm({
                          role: f.role,
                          file,
                          family: familyFromFile(file.name),
                          weight: weightFromFile(file.name),
                        });
                      }}
                    />
                  </div>
                )}
                {note(`font-${f.role}`)}
              </div>
            ))}
          </div>
          <p className="ds-note">
            Upload a .ttf, .otf, .woff or .woff2 file you have a licence to use. Uploads are saved straight away. How the
            fonts are used is set in the brand rules below.
          </p>
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
                      rows={3}
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
                  <div className="ds-img-foot">
                    {confirmImage === img.id ? (
                      <>
                        <span>
                          {img.usedBy > 0
                            ? `Used in ${decks(img.usedBy)}. Those slides will show a gap. Remove it?`
                            : 'Remove this image?'}
                        </span>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => removeImage(img.id)}
                          disabled={busy === `remove-${img.id}`}
                        >
                          {busy === `remove-${img.id}` ? 'Removing…' : 'Remove'}
                        </button>
                        <button type="button" className="btn-quiet" onClick={() => setConfirmImage(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-quiet"
                        aria-label={`Remove the image: ${img.alt}`}
                        onClick={() => setConfirmImage(img.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
          {imageForm ? (
            <form className="ds-add ds-add-image" onSubmit={submitImage} noValidate>
              <p className="ds-add-file">{imageForm.file.name}</p>
              <label>
                <span>What it shows</span>
                <input
                  value={imageForm.alt}
                  maxLength={200}
                  autoFocus
                  placeholder="A waterfall dropping into a fjord"
                  onChange={(e) => setImageForm({ ...imageForm, alt: e.target.value })}
                />
              </label>
              <label>
                <span>When to use it</span>
                <input
                  value={imageForm.use}
                  maxLength={300}
                  placeholder="Covers and section openers"
                  onChange={(e) => setImageForm({ ...imageForm, use: e.target.value })}
                />
              </label>
              <div className="ds-add-actions">
                <button type="submit" className="btn-ink" disabled={busy === 'image'}>
                  {busy === 'image' ? 'Adding…' : 'Add image'}
                </button>
                <button type="button" className="btn-quiet" onClick={() => setImageForm(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="ds-actions">
              <FileButton
                label="Add an image"
                accept="image/jpeg,image/png,image/webp"
                disabled={saved.images.length >= MAX_IMAGES}
                onFile={(file) => {
                  setNotice(null);
                  setImageForm({ file, alt: '', use: '' });
                }}
              />
              {saved.images.length >= MAX_IMAGES && (
                <span className="ds-limit">The library holds up to {MAX_IMAGES} images.</span>
              )}
            </div>
          )}
          {note('image')}
          <p className="ds-note">JPG, PNG or WebP. Adding and removing images is saved straight away.</p>
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
