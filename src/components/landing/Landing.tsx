'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import VoilaLogo from '@/components/VoilaLogo';
import '@/components/workspace/workspace.css';
import './landing.css';

export type LandingBrand = {
  id: string;
  name: string;
  tagline: string;
  wordmark: string;
  colours: string[];
  todo: number;
  decks: number;
  proposal: 'none' | 'working' | 'ready' | 'error';
};

export type DeletedBrand = { id: string; brandId: string; name: string; deletedAt: string; decks: number };

type Way = 'hand' | 'guidelines' | 'website';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const WAYS: { key: Way; title: string; text: string }[] = [
  {
    key: 'hand',
    title: 'Add the assets yourself',
    text: 'Upload the logo and fonts, set the colours and write the brand rules, one section at a time.',
  },
  {
    key: 'guidelines',
    title: 'Upload brand guidelines',
    text: 'Give a PDF or a link. The agent reads it and proposes the colours, fonts and rules for you to check.',
  },
  {
    key: 'website',
    title: 'Use the website',
    text: 'No guidelines? The agent works the identity out from how the brand’s site looks, logo included.',
  },
];

export default function Landing({
  brands: initialBrands,
  trash: initialTrash,
  signIn,
}: {
  brands: LandingBrand[];
  trash: DeletedBrand[];
  signIn: boolean;
}) {
  const [brands, setBrands] = useState(initialBrands);
  const [trash, setTrash] = useState(initialTrash);
  const [confirming, setConfirming] = useState('');
  const [removing, setRemoving] = useState('');
  const [listError, setListError] = useState<{ id: string; text: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [way, setWay] = useState<Way>('hand');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [site, setSite] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A brand made on an earlier try whose guidelines could not be read: reused, not made twice.
  const made = useRef<{ name: string; id: string } | null>(null);
  const [madeId, setMadeId] = useState('');

  async function setUp(e: FormEvent) {
    e.preventDefault();
    const brandName = name.trim();
    if (!brandName) return setError('Give the brand a name.');
    if (way === 'guidelines' && !file && !link.trim()) return setError('Upload the guidelines PDF or paste a link to them.');
    if (way === 'website' && !site.trim()) return setError('Type the website address.');
    setBusy(true);
    setError('');
    try {
      let id = made.current?.name === brandName ? made.current.id : '';
      if (!id) {
        const res = await fetch('/api/brands', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: brandName, website: way === 'website' ? site.trim() : '' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'The brand could not be created. Try again.');
        id = data.id;
        made.current = { name: brandName, id };
      }
      if (way !== 'hand') {
        const form = new FormData();
        form.set('brand', id);
        if (way === 'guidelines' && file) form.set('file', file);
        else form.set('url', way === 'website' ? site.trim() : link.trim());
        const res = await fetch('/api/design/import', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMadeId(id);
          throw new Error(data.error ?? 'That could not be read. Try again.');
        }
      }
      window.location.assign(`/design?brand=${encodeURIComponent(id)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function removeBrand(b: LandingBrand) {
    setRemoving(b.id);
    setListError(null);
    setNotice('');
    try {
      const res = await fetch(`/api/brands?id=${encodeURIComponent(b.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The brand could not be deleted. Try again.');
      setBrands((list) => list.filter((x) => x.id !== b.id));
      setTrash((list) => [data as DeletedBrand, ...list]);
      setConfirming('');
      setNotice(`${b.name} was deleted. You can restore it under Recently deleted.`);
    } catch (err) {
      setListError({ id: b.id, text: (err as Error).message });
    } finally {
      setRemoving('');
    }
  }

  async function restore(item: DeletedBrand) {
    setRemoving(item.id);
    setListError(null);
    setNotice('');
    try {
      const res = await fetch('/api/brands/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trash: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The brand could not be restored. Try again.');
      // The card needs the brand's details again, which the page reads fresh.
      window.location.reload();
    } catch (err) {
      setListError({ id: item.id, text: (err as Error).message });
      setRemoving('');
    }
  }

  async function signOut() {
    await fetch('/api/login', { method: 'DELETE' }).catch(() => null);
    window.location.assign('/login');
  }

  const pick = (next: Way) => {
    setWay(next);
    setError('');
  };

  return (
    <div className="ws lp">
      <header className="lp-top">
        <span className="lp-logo">
          <VoilaLogo />
        </span>
        {signIn ? (
          <button type="button" className="btn-quiet" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <span className="lp-hint" title="Add ACCESSO_PASSWORD to .env.local and restart the app">
            No team password is set
          </span>
        )}
      </header>

      <main className="lp-main">
        <section aria-labelledby="lp-setup">
          <h1 id="lp-setup">Set up a brand</h1>
          <p className="lp-sub">
            Every presentation is designed in a client&rsquo;s brand. Choose how to bring a new one in. Whichever you
            pick, you check everything before the agent designs with it.
          </p>

          <div className="lp-ways" role="radiogroup" aria-label="How to set up the brand">
            {WAYS.map((w) => (
              <button
                key={w.key}
                type="button"
                role="radio"
                aria-checked={way === w.key}
                className="lp-way"
                onClick={() => pick(w.key)}
              >
                <b>{w.title}</b>
                <span>{w.text}</span>
              </button>
            ))}
          </div>

          <form className="lp-form" onSubmit={setUp} noValidate>
            <label className="lp-field">
              <span>Brand name</span>
              <input
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="Northwind"
              />
            </label>

            {way === 'guidelines' && (
              <div className="lp-field">
                <span>Guidelines</span>
                <div className="lp-source">
                  <label className="btn-quiet lp-file">
                    {file ? 'Change PDF' : 'Choose a PDF'}
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setError('');
                      }}
                    />
                  </label>
                  {file ? (
                    <span className="lp-chosen">
                      {file.name}
                      <button type="button" onClick={() => setFile(null)} aria-label="Remove the PDF">
                        Remove
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="lp-or">or</span>
                      <input
                        value={link}
                        onChange={(e) => {
                          setLink(e.target.value);
                          setError('');
                        }}
                        inputMode="url"
                        placeholder="Link to the guidelines"
                        aria-label="Link to the guidelines"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {way === 'website' && (
              <label className="lp-field">
                <span>Website</span>
                <input
                  value={site}
                  onChange={(e) => {
                    setSite(e.target.value);
                    setError('');
                  }}
                  inputMode="url"
                  placeholder="northwind.com"
                />
              </label>
            )}

            {error && (
              <p className="lp-error" role="alert">
                {error}{' '}
                {madeId && (
                  <>
                    The brand itself was created: fix this and try again, or{' '}
                    <a href={`/design?brand=${encodeURIComponent(madeId)}`}>add its details yourself</a>.
                  </>
                )}
              </p>
            )}

            <div className="lp-go">
              <button type="submit" className="btn-ink" disabled={busy}>
                {busy
                  ? way === 'hand'
                    ? 'Creating…'
                    : 'Reading…'
                  : way === 'hand'
                    ? 'Create brand'
                    : way === 'guidelines'
                      ? 'Create brand and read guidelines'
                      : 'Create brand and read website'}
              </button>
              <span className="lp-hint">
                {way === 'hand'
                  ? 'It starts with a placeholder logo and starter colours, and a list of what to add.'
                  : 'Reading takes a minute or two. The proposal waits on the brand’s page for you to check.'}
              </span>
            </div>
          </form>
        </section>

        <section aria-labelledby="lp-brands" className="lp-brands">
          <h2 id="lp-brands">Your brands</h2>
          {notice && (
            <p className="lp-notice" role="status">
              {notice}
            </p>
          )}
          {brands.length === 0 && <p className="lp-sub">No brands yet. Set one up above to start making presentations.</p>}
          <ul className="lp-grid">
            {brands.map((b) => (
              <li key={b.id} className="lp-brand">
                <div className="lp-brand-head">
                  <span className="lp-word" dangerouslySetInnerHTML={{ __html: b.wordmark }} />
                  <span className="lp-dots" aria-hidden="true">
                    {b.colours.map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                  </span>
                </div>
                <div>
                  <b>{b.name}</b>
                  {b.tagline && <p className="lp-tag">{b.tagline}</p>}
                </div>
                <p className="lp-state">
                  {b.proposal === 'ready'
                    ? 'A proposal is waiting to be checked'
                    : b.proposal === 'working'
                      ? 'The agent is reading its guidelines'
                      : b.todo > 0
                        ? `${b.todo} ${b.todo === 1 ? 'thing' : 'things'} left to add`
                        : 'Ready to use'}
                  {' · '}
                  {b.decks === 1 ? '1 presentation' : `${b.decks} presentations`}
                </p>
                {confirming === b.id ? (
                  <div className="lp-confirm" role="group" aria-label={`Delete ${b.name}`}>
                    <p>
                      Delete <b>{b.name}</b>?{' '}
                      {b.decks === 0
                        ? 'Its files and knowledge base go with it.'
                        : b.decks === 1
                          ? 'Its presentation and knowledge base go with it.'
                          : `Its ${b.decks} presentations and knowledge base go with it.`}{' '}
                      You can restore it afterwards.
                    </p>
                    <div className="lp-actions">
                      <button type="button" className="lp-danger" disabled={removing === b.id} onClick={() => removeBrand(b)}>
                        {removing === b.id ? 'Deleting…' : 'Delete brand'}
                      </button>
                      <button type="button" className="btn-quiet" disabled={removing === b.id} onClick={() => setConfirming('')}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="lp-actions">
                    <Link href={`/new?brand=${encodeURIComponent(b.id)}`} className="btn-ink">
                      Make a presentation
                    </Link>
                    <Link href={`/design?brand=${encodeURIComponent(b.id)}`} className="btn-quiet">
                      Design system
                    </Link>
                    <button
                      type="button"
                      className="lp-delete"
                      onClick={() => {
                        setConfirming(b.id);
                        setListError(null);
                        setNotice('');
                      }}
                      aria-label={`Delete ${b.name}`}
                    >
                      Delete
                    </button>
                  </div>
                )}
                {listError?.id === b.id && (
                  <p className="lp-error" role="alert">
                    {listError.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {trash.length > 0 && (
          <section aria-labelledby="lp-trash" className="lp-trash">
            <h2 id="lp-trash">Recently deleted</h2>
            <ul>
              {trash.map((t) => (
                <li key={t.id}>
                  <span>
                    <b>{t.name}</b>
                    <span className="lp-hint">
                      {' '}
                      deleted {when(t.deletedAt)}
                      {t.decks > 0 ? `, with ${plural(t.decks, 'presentation', 'presentations')}` : ''}
                    </span>
                  </span>
                  <button type="button" className="btn-quiet" disabled={removing === t.id} onClick={() => restore(t)}>
                    {removing === t.id ? 'Restoring…' : 'Restore'}
                  </button>
                  {listError?.id === t.id && (
                    <p className="lp-error" role="alert">
                      {listError.text}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
