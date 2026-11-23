'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { parseEntry, type KnowledgeSummary } from '@/lib/knowledge/format';
import type { BrandOption } from '@/lib/workspace';
import { useAutosize } from './Composer';
import { IconBook, IconPlus, IconSearch } from './icons';

type Usage = { id: string; title: string; slides: number[] };
type Detail = KnowledgeSummary & { body: string; usage: Usage[] };
type Draft = { title: string; tags: string; source: string; status: 'draft' | 'verified'; body: string };

const EMPTY: Draft = { title: '', tags: '', source: '', status: 'draft', body: '' };

/** Topics decks most often need and a new knowledge base usually lacks. */
const TOPICS = [
  'Company facts',
  'Key figures',
  'Customers and partners',
  'Milestones and timeline',
  'Team',
  'Sustainability',
];

const toDraft = (d: Detail): Draft => ({
  title: d.title,
  tags: d.tags.join(', '),
  source: d.source,
  status: d.status === 'verified' ? 'verified' : 'draft',
  body: d.body,
});

const same = (a: Draft, b: Draft) =>
  a.title === b.title && a.tags === b.tags && a.source === b.source && a.status === b.status && a.body === b.body;

const api = (brand: string, path?: string) =>
  path
    ? `/api/knowledge/entry?brand=${encodeURIComponent(brand)}&path=${encodeURIComponent(path)}`
    : `/api/knowledge?brand=${encodeURIComponent(brand)}`;

function StatusTag({ status }: { status: string }) {
  return (
    <span className="kb-tag" data-status={status === 'verified' ? 'verified' : 'draft'}>
      {status === 'verified' ? 'Verified' : 'Draft'}
    </span>
  );
}

/**
 * The knowledge base inside the workspace: entries and search in the middle
 * column, the selected entry as an editable sheet on the right.
 */
export default function KnowledgeView({
  brand,
  initial,
  initialPath,
  onCount,
  onShowEntry,
}: {
  brand: BrandOption;
  initial: KnowledgeSummary[];
  initialPath?: string;
  onCount: (n: number) => void;
  onShowEntry: () => void;
}) {
  const [entries, setEntries] = useState(initial);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnowledgeSummary[] | null>(null);
  const [selected, setSelected] = useState<string | 'new' | null>(initialPath ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const keepNotice = useRef(false);
  const bodyRef = useAutosize(draft.body);
  const titleRef = useAutosize(draft.title);
  const dirty = !same(draft, saved);
  const brandId = brand.id;

  const reloadList = useCallback(async () => {
    const res = await fetch(api(brandId), { cache: 'no-store' });
    if (!res.ok) return;
    const list: KnowledgeSummary[] = await res.json();
    setEntries(list);
    onCount(list.length);
  }, [brandId, onCount]);

  // Refresh on open, so entries added outside the app (or by another tab) show up.
  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  // Search as the agent would, so you can check what it will find.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`${api(brandId)}&q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (res.ok) setResults(await res.json());
    }, 200);
    return () => clearTimeout(timer);
  }, [query, brandId, entries]);

  // Load the selected entry, and keep its path in the address so it can be linked to.
  useEffect(() => {
    setError('');
    if (!keepNotice.current) setNotice('');
    keepNotice.current = false;
    setConfirmDelete(false);
    const url = selected && selected !== 'new' ? `/knowledge?entry=${encodeURIComponent(selected)}` : '/knowledge';
    window.history.replaceState(null, '', url);
    if (!selected || selected === 'new') {
      setDetail(null);
      return;
    }
    let live = true;
    fetch(api(brandId, selected), { cache: 'no-store' }).then(async (res) => {
      if (!live) return;
      if (!res.ok) {
        setDetail(null);
        setSelected(null);
        setNotice('That entry no longer exists.');
        return;
      }
      const d: Detail = await res.json();
      setDetail(d);
      setDraft(toDraft(d));
      setSaved(toDraft(d));
    });
    return () => {
      live = false;
    };
  }, [selected, brandId]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  function open(next: string | 'new', title = '') {
    if (dirty && !window.confirm('Discard the changes to this entry?')) return;
    if (next === 'new') {
      const fresh = { ...EMPTY, title };
      setDraft(fresh);
      setSaved(EMPTY);
      setDetail(null);
      setTimeout(() => (title ? bodyRef.current : titleRef.current)?.focus(), 0);
    }
    setSelected(next);
    onShowEntry();
  }

  const set = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 400_000) {
      setError('That file is too large. Keep each entry to one topic, under about 50,000 characters.');
      return;
    }
    const text = await file.text();
    const parsed = parseEntry(text, file.name.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' '));
    setDraft((d) => ({
      title: d.title || parsed.title,
      tags: d.tags || parsed.tags.join(', '),
      source: d.source || parsed.source || file.name,
      status: parsed.status === 'verified' ? 'verified' : d.status,
      body: parsed.body,
    }));
    setError('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const isNew = selected === 'new';
      const res = await fetch(isNew ? api(brandId) : api(brandId, selected), {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The entry could not be saved.');
      await reloadList();
      if (isNew) {
        setSaved(draft);
        keepNotice.current = true;
        setSelected(data.path);
        setNotice('Entry added. The agent can use it from the next request.');
      } else {
        setDetail(data);
        setDraft(toDraft(data));
        setSaved(toDraft(data));
        setNotice('Changes saved.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected || selected === 'new') return;
    setBusy(true);
    setError('');
    const res = await fetch(api(brandId, selected), { method: 'DELETE' });
    setBusy(false);
    if (!res.ok && res.status !== 404) {
      setError('The entry could not be deleted.');
      return;
    }
    setSaved(EMPTY);
    setDraft(EMPTY);
    keepNotice.current = true;
    setNotice('Entry deleted.');
    setSelected(null);
    await reloadList();
  }

  const shown = results ?? entries;
  const usedSlides = detail?.usage.reduce((n, u) => n + u.slides.length, 0) ?? 0;

  return (
    <>
      <section className="ws-chat kbv" aria-label="Knowledge entries">
        <div className="kbv-tools">
          <label className="kbv-search">
            <IconSearch />
            <span className="sr-only">Search the knowledge base</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the way the agent does"
            />
          </label>
          <button type="button" className="btn-ink" onClick={() => open('new')}>
            <IconPlus />
            Add entry
          </button>
        </div>

        <div className="ws-scroll">
          {query.trim() && results && (
            <p className="kbv-count">
              {results.length === 0
                ? 'The agent would find nothing for this search.'
                : `The agent would find ${results.length === 1 ? '1 entry' : `${results.length} entries`}, best match first.`}
            </p>
          )}
          {!query.trim() && entries.length === 0 && (
            <div className="kbv-empty">
              <p>
                No knowledge yet. Add the facts, figures and descriptions the agent may use in {brand.name}{' '}
                presentations.
              </p>
            </div>
          )}
          <ul className="kbv-items">
            {shown.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  aria-current={selected === e.path ? 'true' : undefined}
                  onClick={() => (selected === e.path ? onShowEntry() : open(e.path))}
                >
                  <span className="kbv-title">{e.title}</span>
                  <span className="kbv-snippet">{e.snippet}</span>
                  <span className="kbv-meta">
                    <StatusTag status={e.status} />
                    {e.tags.slice(0, 4).map((t) => (
                      <span key={t} className="kbv-tagword">
                        {t}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="kbv-foot">Entries are saved as text files in the project&rsquo;s knowledge/{brand.id} folder.</p>
      </section>

      <section className="ws-preview kbv-desk" aria-label="Knowledge entry">
        <div className="kbv-desk-scroll">
          {notice && !selected && (
            <p className="kbv-notice kbv-notice-float" role="status">
              {notice}
            </p>
          )}
          {selected && (selected === 'new' || detail) ? (
            <form className="sheet" onSubmit={save}>
              <textarea
                ref={titleRef}
                className="sheet-title"
                rows={1}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value.replace(/\n/g, ' ') }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                placeholder="Title, e.g. Funding and investors"
                aria-label="Title"
                maxLength={160}
                required
              />

              <div className="sheet-fields">
                <div className="sheet-field">
                  <span className="sheet-label" id="kb-status">
                    Status
                  </span>
                  <div className="seg" role="group" aria-labelledby="kb-status">
                    <button
                      type="button"
                      aria-pressed={draft.status === 'draft'}
                      onClick={() => setDraft((d) => ({ ...d, status: 'draft' }))}
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      aria-pressed={draft.status === 'verified'}
                      onClick={() => setDraft((d) => ({ ...d, status: 'verified' }))}
                    >
                      Verified
                    </button>
                  </div>
                </div>
                <label className="sheet-field">
                  <span className="sheet-label">Source</span>
                  <input
                    value={draft.source}
                    onChange={set('source')}
                    placeholder="Where this came from"
                    maxLength={300}
                  />
                </label>
                <label className="sheet-field sheet-field-wide">
                  <span className="sheet-label">Tags</span>
                  <input value={draft.tags} onChange={set('tags')} placeholder="funding, investors, finance" />
                </label>
              </div>

              <label className="sheet-body">
                <span className="sr-only">Text the agent may use</span>
                <textarea
                  ref={bodyRef}
                  value={draft.body}
                  onChange={set('body')}
                  placeholder="Write the facts as plain sentences, with their numbers and dates. The agent quotes from this and nothing else."
                  maxLength={50_000}
                  required
                />
              </label>

              {error && (
                <p className="composer-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="kbv-notice" role="status">
                  {notice}
                </p>
              )}

              <div className="sheet-actions">
                <button type="submit" className="btn-ink" disabled={busy || !dirty}>
                  {selected === 'new' ? 'Add entry' : 'Save changes'}
                </button>
                {selected === 'new' && (
                  <label className="btn-quiet sheet-upload">
                    Upload a text file
                    <input type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={upload} />
                  </label>
                )}
                {dirty && selected !== 'new' && (
                  <button type="button" className="btn-quiet" onClick={() => setDraft(saved)} disabled={busy}>
                    Undo changes
                  </button>
                )}
                <span className="grow" />
                {selected !== 'new' &&
                  (confirmDelete ? (
                    <span className="sheet-confirm" role="group" aria-label="Confirm delete">
                      <span>
                        {usedSlides > 0
                          ? `${usedSlides === 1 ? 'One slide cites' : `${usedSlides} slides cite`} this. Delete it?`
                          : 'Delete this entry?'}
                      </span>
                      <button type="button" className="btn-danger" onClick={remove} disabled={busy}>
                        Delete
                      </button>
                      <button type="button" className="btn-quiet" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn-quiet" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </button>
                  ))}
              </div>

              {detail && selected !== 'new' && (
                <dl className="sheet-meta">
                  <div>
                    <dt>File</dt>
                    <dd>{detail.path}</dd>
                  </div>
                  {detail.updated && (
                    <div>
                      <dt>Updated</dt>
                      <dd>
                        {new Date(`${detail.updated}T12:00:00Z`).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Used in</dt>
                    <dd>
                      {detail.usage.length === 0
                        ? 'No presentation cites this yet.'
                        : detail.usage.map((u, i) => (
                            <span key={u.id}>
                              {i > 0 && ', '}
                              <Link href={`/studio/${u.id}`} className="link">
                                {u.title}
                              </Link>{' '}
                              (slide{u.slides.length > 1 ? 's' : ''} {u.slides.join(', ')})
                            </span>
                          ))}
                    </dd>
                  </div>
                </dl>
              )}
            </form>
          ) : (
            <div className="sheet sheet-empty">
              <IconBook />
              <h2>What the agent knows about {brand.name}</h2>
              <p>
                The agent writes slides only from what is here and in the brief, and it never invents figures. Choose an
                entry to read or edit it, or add what is missing.
              </p>
              <p className="sheet-empty-h">Often missing</p>
              <ul className="sheet-topics">
                {TOPICS.filter((t) => !entries.some((e) => e.title.toLowerCase().includes(t.toLowerCase()))).map(
                  (t) => (
                    <li key={t}>
                      <button type="button" className="btn-quiet" onClick={() => open('new', t)}>
                        <IconPlus />
                        {t}
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
