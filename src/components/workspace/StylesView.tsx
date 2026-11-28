'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { PresentationStyle } from '@/lib/knowledge/styles';
import { useAutosize } from './Composer';

type Draft = { id: string | null; name: string; when: string; body: string };

/** Headings to write under, so a new style covers what the agent needs. Prompts only: no invented content. */
const OUTLINE = `## What these presentations are for


## Structure
The sections in order, and roughly how many slides each gets.


## Tone and wording


## Slide habits
What a typical slide looks like: how much text, when to use figures, images or quotes.


## Always include


## Avoid
`;

const KINDS = ['Investor pitch', 'Sales proposal', 'Company introduction', 'Internal update', 'Event talk'];

const snippet = (body: string) => {
  const text = body.replace(/^#+\s.*$/gm, '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 179).trimEnd()}…` : text;
};

/**
 * Presentation styles for a brand: how its presentations of each kind are built.
 * The agent follows the chosen style when it plans and writes a deck.
 */
export default function StylesView({ brand, brandName }: { brand: string; brandName: string }) {
  const api = `/api/knowledge/styles?brand=${encodeURIComponent(brand)}`;
  const [styles, setStyles] = useState<PresentationStyle[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useAutosize(draft?.body ?? '');

  useEffect(() => {
    let live = true;
    fetch(api, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => live && setStyles(list))
      .catch(() => live && setStyles([]));
    return () => {
      live = false;
    };
  }, [api]);

  const start = (d: Draft) => {
    setDraft(d);
    setError('');
    setNotice('');
    setConfirmDelete(false);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (draft.body.replace(/\s+/g, ' ').trim() === OUTLINE.replace(/\s+/g, ' ').trim()) {
      return setError('Write the style under the headings first.');
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(draft.id ? `${api}&id=${encodeURIComponent(draft.id)}` : api, {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: draft.name, when: draft.when, body: draft.body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The style could not be saved. Try again.');
      setStyles(data.styles);
      setNotice(`${data.style.name} was saved. The agent can use it for new presentations.`);
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    const res = await fetch(`${api}&id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? 'The style could not be removed. Try again.');
    setStyles(data.styles);
    setNotice(`${draft.name} was removed.`);
    setDraft(null);
  }

  async function fromFile(file: File | undefined) {
    if (!file || !draft) return;
    if (file.size > 200_000 || !/\.(md|txt)$/i.test(file.name)) return setError('Choose a .md or .txt file under 200 KB.');
    const text = (await file.text()).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    setDraft({ ...draft, body: text.slice(0, 8000), name: draft.name || file.name.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ') });
    setError('');
  }

  return (
    <div className="pst">
      <div className="pst-inner">
        <h1>Presentation styles</h1>
        <p className="pst-lede">
          How {brandName} builds each kind of presentation: the structure, length, tone and slide habits. Choose a style
          when you start a presentation and the agent follows it; leave the choice open and it picks the one that fits
          the brief. Styles are guidance, so the agent never quotes them as facts.
        </p>

        {notice && (
          <p className="pst-notice" role="status">
            {notice}
          </p>
        )}

        {draft ? (
          <form className="pst-form" onSubmit={save} noValidate>
            <label>
              <span>Name</span>
              <input
                value={draft.name}
                maxLength={80}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Investor pitch"
                autoFocus={!draft.id}
              />
            </label>
            <label>
              <span>When to use it</span>
              <input
                value={draft.when}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, when: e.target.value })}
                placeholder="First meetings with investors who do not know the company"
              />
            </label>
            <label>
              <span>The style</span>
              <textarea
                ref={bodyRef}
                rows={14}
                value={draft.body}
                maxLength={8000}
                onChange={(e) => {
                  setDraft({ ...draft, body: e.target.value });
                  setError('');
                }}
              />
            </label>
            <p className="pst-hint">
              Write under the headings, or replace them. Describe how these presentations are built, not what a
              particular one says: facts belong in the knowledge base.{' '}
              <label className="pst-file">
                Fill in from a .md or .txt file
                <input
                  type="file"
                  accept=".md,.txt,text/plain,text/markdown"
                  onChange={(e) => {
                    void fromFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </p>
            {error && (
              <p className="pst-error" role="alert">
                {error}
              </p>
            )}
            <div className="pst-actions">
              <button type="submit" className="btn-ink" disabled={busy}>
                {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Save style'}
              </button>
              <button type="button" className="btn-quiet" disabled={busy} onClick={() => setDraft(null)}>
                Cancel
              </button>
              {draft.id &&
                (confirmDelete ? (
                  <>
                    <button type="button" className="btn-quiet pst-danger" disabled={busy} onClick={remove}>
                      Remove this style
                    </button>
                    <button type="button" className="btn-quiet" onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="pst-remove" onClick={() => setConfirmDelete(true)}>
                    Remove
                  </button>
                ))}
            </div>
          </form>
        ) : (
          <>
            {styles && styles.length === 0 && (
              <div className="pst-empty">
                <p>
                  No styles yet. Without one, the agent plans each presentation from the brief and the brand rules
                  alone. Start with the kind of presentation {brandName} makes most often:
                </p>
                <div className="pst-actions">
                  {KINDS.map((k) => (
                    <button key={k} type="button" className="btn-quiet" onClick={() => start({ id: null, name: k, when: '', body: OUTLINE })}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ul className="pst-list">
              {styles?.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => start({ id: s.id, name: s.name, when: s.when, body: s.body })}>
                    <b>{s.name}</b>
                    {s.when && <span className="pst-when">{s.when}</span>}
                    <span className="pst-snippet">{snippet(s.body)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="pst-actions">
              <button type="button" className="btn-ink" onClick={() => start({ id: null, name: '', when: '', body: OUTLINE })}>
                Add a style
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
