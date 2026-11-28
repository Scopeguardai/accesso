'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { PresentationStyle } from '@/lib/knowledge/styles';
import { LOOK_INFO, type Look } from '@/lib/brand/looks';
import { useAutosize } from './Composer';

type Draft = { id: string | null; name: string; when: string; body: string; fromExamples?: boolean };
type Example = { file: string; name: string; kind: 'pdf' | 'pptx'; size: number };
type Study =
  | { status: 'none' }
  | { status: 'working'; from: string[] }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      from: string[];
      draft: { name: string; when: string; body: string };
      design?: { look: Look; cover: string; corners: string; headings: string; why: string };
    };

const PIECE = 8_000_000;
const mb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

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
  const exApi = `/api/knowledge/styles/examples?brand=${encodeURIComponent(brand)}`;
  const [examples, setExamples] = useState<Example[]>([]);
  const [study, setStudy] = useState<Study>({ status: 'none' });
  const [exBusy, setExBusy] = useState('');
  const [exError, setExError] = useState('');
  const [designApplied, setDesignApplied] = useState(false);

  // The examples already uploaded and any draft waiting; checked again while the agent works.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const res = await fetch(exApi, { cache: 'no-store' }).catch(() => null);
      if (!live || !res?.ok) return;
      const data = await res.json();
      setExamples(data.examples);
      setStudy(data.draft);
      if (data.draft.status === 'working') timer = setTimeout(check, 3000);
    };
    void check();
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // Runs on opening and again each time a study starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exApi, study.status === 'working']);

  async function addExamples(list: FileList | null) {
    if (!list?.length) return;
    setExError('');
    try {
      for (const file of Array.from(list)) {
        if (!/\.(pdf|pptx)$/i.test(file.name)) throw new Error(`${file.name}: upload presentations as PDF or PowerPoint (.pptx) files.`);
        if (file.size > 65_000_000) throw new Error(`${file.name} is too large (over 65 MB). Export a smaller PDF.`);
        const count = Math.max(1, Math.ceil(file.size / PIECE));
        const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
        for (let i = 0; i < count; i += 1) {
          setExBusy(`Uploading ${file.name}${count > 1 ? ` (${Math.round(((i + 1) / count) * 100)}%)` : ''}…`);
          const form = new FormData();
          form.set('brand', brand);
          form.set('upload', id);
          form.set('index', String(i));
          form.set('count', String(count));
          form.set('name', file.name);
          form.set('piece', file.slice(i * PIECE, (i + 1) * PIECE), 'piece');
          const res = await fetch('/api/knowledge/styles/examples/upload', { method: 'POST', body: form });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error ?? (res.status === 413 ? `${file.name} was too large to send.` : `${file.name} could not be uploaded. Try again.`));
          if (data.examples) setExamples(data.examples);
        }
      }
    } catch (err) {
      setExError((err as Error).message);
    } finally {
      setExBusy('');
    }
  }

  async function removeExample(file: string) {
    const res = await fetch(`${exApi}&file=${encodeURIComponent(file)}`, { method: 'DELETE' }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) setExamples(data.examples);
    else setExError(data?.error ?? 'That example could not be removed.');
  }

  async function startStudy() {
    setExError('');
    setExBusy('Starting…');
    const res = await fetch('/api/knowledge/styles/examples/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setExBusy('');
    if (!res?.ok) return setExError(data?.error ?? 'The agent could not start. Try again.');
    setStudy(data);
  }

  /** Make the design the agent matched to the examples this brand's deck design. */
  async function applyDesign() {
    if (study.status !== 'ready' || !study.design) return;
    const { why: _why, ...design } = study.design;
    const res = await fetch('/api/design/look', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brand, design }),
    }).catch(() => null);
    if (res?.ok) setDesignApplied(true);
    else setExError('The design could not be applied. Set it under Design system, Deck design.');
  }

  /** Forget the draft and the uploaded examples, once the style is saved or the draft is not wanted. */
  async function finishStudy() {
    const res = await fetch(`${exApi}&all=1`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      setExamples([]);
      setStudy({ status: 'none' });
    }
  }

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
      if (draft.fromExamples) void finishStudy();
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
              {draft.fromExamples
                ? 'The agent wrote this from your examples. Check it reads true, change what is wrong, then save. '
                : 'Write under the headings, or replace them. '}
              Describe how these presentations are built, not what a particular one says: facts belong in the knowledge
              base.{' '}
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

            <section className="pst-examples" aria-labelledby="pst-ex">
              <h2 id="pst-ex">Create a style from example presentations</h2>
              <p className="pst-lede">
                Upload up to five presentations {brandName} has made before, as PDF or PowerPoint. The agent studies how
                they are built (the order of sections, the layouts, how much is on a slide, the tone) and drafts a style
                for you to check and save. It describes how they are built, not what they say. PDFs give the best
                result, because the agent can look at the slides as well as read them.
              </p>

              {study.status === 'ready' ? (
                <div className="pst-ready">
                  <p>
                    <b>A draft style is ready: {study.draft.name}.</b> Written from {study.from.join(', ')}.
                  </p>
                  {study.design && (
                    <div className="pst-design">
                      <p>
                        <b>The design closest to these examples: {LOOK_INFO[study.design.look].name}</b>, with a{' '}
                        {study.design.cover === 'accent' ? 'coloured' : study.design.cover} cover, {study.design.corners}{' '}
                        picture corners and {study.design.headings} headings. {study.design.why}
                      </p>
                      <div className="pst-actions">
                        <button type="button" className="btn-quiet" disabled={designApplied} onClick={applyDesign}>
                          {designApplied ? `${brandName} now uses this design` : `Use this design for ${brandName}`}
                        </button>
                        <a className="pst-link" href={`/design?brand=${encodeURIComponent(brand)}#ds-deck`}>
                          See it under Deck design
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="pst-actions">
                    <button type="button" className="btn-ink" onClick={() => start({ id: null, ...study.draft, fromExamples: true })}>
                      Review and save
                    </button>
                    <button type="button" className="btn-quiet" onClick={finishStudy}>
                      Discard the draft
                    </button>
                  </div>
                </div>
              ) : study.status === 'working' ? (
                <p className="pst-working" role="status">
                  <span className="dot" data-status="generating" aria-hidden="true" />
                  The agent is studying {study.from.join(', ')}. This takes a few minutes; you can leave this page.
                </p>
              ) : (
                <>
                  {examples.length > 0 && (
                    <ul className="pst-files">
                      {examples.map((e) => (
                        <li key={e.file}>
                          <span>
                            {e.name} <span className="pst-hint">{mb(e.size)}</span>
                          </span>
                          <button type="button" className="pst-remove" onClick={() => removeExample(e.file)} aria-label={`Remove ${e.name}`}>
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pst-actions">
                    <label className={`btn-quiet pst-pick${exBusy ? ' is-disabled' : ''}`}>
                      {examples.length ? 'Add another presentation' : 'Upload presentations'}
                      <input
                        type="file"
                        multiple
                        disabled={!!exBusy}
                        accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        onChange={(e) => {
                          void addExamples(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {examples.length > 0 && (
                      <button type="button" className="btn-ink" disabled={!!exBusy} onClick={startStudy}>
                        Study {examples.length === 1 ? 'it' : 'them'} and draft a style
                      </button>
                    )}
                    {exBusy && (
                      <span className="pst-hint" role="status">
                        {exBusy}
                      </span>
                    )}
                  </div>
                </>
              )}
              {(exError || study.status === 'error') && (
                <p className="pst-error" role="alert">
                  {exError || (study.status === 'error' ? study.error : '')}
                </p>
              )}
              <p className="pst-hint">
                Use examples of one kind at a time, such as three investor pitches, so the style is about that kind. The
                files are removed once the style is saved.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
