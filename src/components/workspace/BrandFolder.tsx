'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesignData } from '@/lib/brand/design';
import type { FolderSearch } from '@/lib/brand/folder-agent';
import { uploadToFolder, type Skipped } from './folder-upload';

type FolderFile = {
  path: string;
  kind: 'logo' | 'font' | 'image' | 'document';
  size: number;
  svg?: string;
  family?: string;
  style?: string;
  weight?: string;
  width?: number;
  height?: number;
};

type Folder = { files: FolderFile[]; search: FolderSearch };

const name = (p: string) => p.split('/').pop() ?? p;
const where = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const SHOW_PHOTOS = 48;

/**
 * The brand folder: the client's own files, searched by the agent. Every pick it makes
 * is a suggestion; nothing is used until someone clicks to use it.
 */
export default function BrandFolder({
  brand,
  onDesign,
  onProposal,
}: {
  brand: string;
  onDesign: (data: DesignData) => void;
  onProposal: () => void;
}) {
  const api = `/api/design/sources?brand=${encodeURIComponent(brand)}`;
  const [folder, setFolder] = useState<Folder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [allPhotos, setAllPhotos] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as Folder;
    setFolder(data);
    // Start with the agent's suggested photos ticked.
    if (data.search.status === 'ready') setChosen(new Set(data.search.picks.images.map((i) => i.path)));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const search = folder?.search ?? { status: 'none' as const };
  const picks = search.status === 'ready' ? search.picks : null;

  // Keep checking while the agent searches; when it finishes, show its picks and any proposal.
  useEffect(() => {
    if (search.status !== 'working') return;
    const timer = setTimeout(async () => {
      const res = await fetch(api, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return setFolder((f) => (f ? { ...f } : f));
      const next = (await res.json()) as Folder;
      setFolder(next);
      if (next.search.status === 'ready') {
        if (next.search.proposal) onProposal();
        setChosen(new Set(next.search.picks.images.map((i) => i.path)));
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [api, search, onProposal]);

  const files = useMemo(() => folder?.files ?? [], [folder]);
  const byKind = (k: FolderFile['kind']) => files.filter((f) => f.kind === k);
  const logos = byKind('logo');
  const fonts = byKind('font');
  const docs = byKind('document');
  const pickedPhoto = new Map(picks?.images.map((i, n) => [i.path, { ...i, n }]) ?? []);
  const photos = byKind('image').sort((a, b) => (pickedPhoto.get(a.path)?.n ?? 999) - (pickedPhoto.get(b.path)?.n ?? 999));
  const suggested = (p: string) =>
    picks?.wordmark?.path === p ? 'Suggested wordmark' : picks?.mark?.path === p ? 'Suggested symbol' : null;
  const logoRank = (p: string) => (picks?.wordmark?.path === p ? 0 : picks?.mark?.path === p ? 1 : 2);
  const orderedLogos = [...logos].sort((a, b) => logoRank(a.path) - logoRank(b.path));
  const fontRole = (p: string) =>
    picks?.headlineFont?.path === p ? 'Suggested for headlines' : picks?.detailFont?.path === p ? 'Suggested for details' : null;
  const orderedFonts = [...fonts].sort((a, b) => Number(!fontRole(a.path)) - Number(!fontRole(b.path)));
  const selectedLogo = logo ?? orderedLogos[0]?.path ?? null;

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy('upload');
    setMessage(null);
    setSkipped([]);
    try {
      const { added, skipped: left, data } = await uploadToFolder(brand, list, (sent, total) => setProgress({ sent, total }));
      if (data) setFolder(data as Folder);
      else await load();
      setSkipped(left);
      setMessage({
        text:
          added > 0
            ? `${plural(added, 'file was', 'files were')} added.${left.length ? ` ${plural(left.length, 'file was', 'files were')} left out; see why below.` : ''}`
            : 'Nothing in that selection could be used. See why below.',
        tone: added > 0 ? 'ok' : 'error',
      });
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'error' });
      await load();
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function startSearch() {
    setBusy('search');
    setMessage(null);
    try {
      const res = await fetch('/api/design/sources/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The search could not start. Try again.');
      setFolder((f) => (f ? { ...f, search: data } : f));
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function dismissPicks() {
    const res = await fetch(`/api/design/sources/search?brand=${encodeURIComponent(brand)}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setFolder((f) => (f ? { ...f, search: { status: 'none' } } : f));
  }

  async function clearAll() {
    setBusy('clear');
    const res = await fetch(`${api}&all=1`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setFolder(await res.json());
    setConfirmClear(false);
    setSkipped([]);
    setMessage(null);
    setBusy(null);
  }

  async function use(body: Record<string, unknown>, label: string, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch('/api/design/sources/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'That could not be used. Try again.');
      onDesign(data.design);
      const extra = data.problems?.length ? ` Not added: ${data.problems.join(' ')}` : '';
      setMessage({ text: typeof done === 'string' ? done.replace('{n}', String(data.added ?? '')) + extra : done, tone: data.problems?.length ? 'error' : 'ok' });
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function addPhotos() {
    const items = photos
      .filter((p) => chosen.has(p.path))
      .map((p) => {
        const pick = pickedPhoto.get(p.path);
        return { path: p.path, alt: pick?.alt ?? name(p.path).replace(/\.\w+$/, '').replace(/[-_]+/g, ' '), use: pick?.use ?? 'Chosen from the brand folder.' };
      });
    if (items.length === 0) return setMessage({ text: 'Tick the photos to add first.', tone: 'error' });
    use({ as: 'images', items: items.slice(0, 40) }, 'photos', `{n} photos were added to the image library. Check their notes under Images.`);
  }

  const toggle = (p: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const working = search.status === 'working';
  const locked = busy !== null || working;

  return (
    <section id="ds-folder" className="ds-sec">
      <h2>Brand folder</h2>
      <p className="ds-lede">
        Add the client&rsquo;s folder of brand files from your computer, or a zip of it. The agent searches it for the
        logo, fonts and photos and reads any guidelines in it. You choose what to use; files are only copied into the
        brand when you click to use them.
      </p>

      <div className="ds-folder-add">
        <label className={`btn-quiet ds-pick${locked ? ' is-disabled' : ''}`}>
          Add a folder
          <input
            type="file"
            multiple
            disabled={locked}
            ref={(el) => el?.setAttribute('webkitdirectory', '')}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <label className={`btn-quiet ds-pick${locked ? ' is-disabled' : ''}`}>
          Add files or a zip
          <input
            type="file"
            multiple
            disabled={locked}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {progress && (
          <span className="ds-prop-hint" role="status">
            Adding {progress.sent} of {progress.total} files…
          </span>
        )}
      </div>

      {message && (
        <p className="ds-msg" data-tone={message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {skipped.length > 0 && (
        <details className="ds-skipped">
          <summary>{plural(skipped.length, 'file was', 'files were')} left out</summary>
          <ul>
            {skipped.slice(0, 200).map((s, i) => (
              <li key={i}>
                <b>{s.path}</b>: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {files.length > 0 && (
        <>
          <div className="ds-folder-bar">
            <span>
              {[
                plural(logos.length, 'logo', 'logos'),
                plural(fonts.length, 'font', 'fonts'),
                plural(photos.length, 'photo', 'photos'),
                plural(docs.length, 'document', 'documents'),
              ].join(' · ')}
            </span>
            <span className="ds-add-actions">
              <button type="button" className="btn-ink" disabled={locked} onClick={startSearch}>
                {working ? 'Searching…' : picks ? 'Search again' : 'Find the brand assets'}
              </button>
              {confirmClear ? (
                <>
                  <button type="button" className="btn-quiet ds-danger" disabled={busy !== null} onClick={clearAll}>
                    Remove all files
                  </button>
                  <button type="button" className="btn-quiet" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn-quiet" disabled={locked} onClick={() => setConfirmClear(true)}>
                  Empty the folder
                </button>
              )}
            </span>
          </div>
          {confirmClear && (
            <p className="ds-prop-hint">
              This removes the files from the brand folder only. Anything already used in the brand stays.
            </p>
          )}

          {working && (
            <p className="ds-imp-working" role="status">
              <span className="dot" data-status="generating" aria-hidden="true" />
              The agent is searching the folder: reading documents and looking at the logos and photos. This takes a few
              minutes; you can leave this page.
            </p>
          )}
          {search.status === 'error' && (
            <p className="ds-msg" data-tone="error" role="alert">
              {search.error}
            </p>
          )}
          {picks && (
            <article className="ds-prop" aria-label="What the agent found">
              <p className="ds-prop-head">
                <b>What the agent found</b>
              </p>
              <p>{picks.summary}</p>
              <p className="ds-prop-hint">
                Its picks are marked below. Check each one and click to use it.
                {search.status === 'ready' && search.proposal
                  ? ' It also read colours and rules from a document: see the proposal under "Fill in from brand guidelines or a website".'
                  : ''}
              </p>
              {picks.openPoints.length > 0 && (
                <div>
                  <p className="ds-prop-label">Check these</p>
                  <ul className="ds-prop-list">
                    {picks.openPoints.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="ds-add-actions">
                <button type="button" className="btn-quiet" onClick={dismissPicks}>
                  Dismiss
                </button>
              </div>
            </article>
          )}

          {logos.length > 0 && (
            <div className="ds-folder-group">
              <h3>Logos</h3>
              <div className="ds-found" role="radiogroup" aria-label="Logos in the folder">
                {orderedLogos.map((l) => (
                  <button
                    key={l.path}
                    type="button"
                    role="radio"
                    aria-checked={selectedLogo === l.path}
                    className="ds-found-tile ds-folder-tile"
                    title={l.path}
                    onClick={() => setLogo(l.path)}
                  >
                    {l.svg ? (
                      <span className="ds-folder-svg" dangerouslySetInnerHTML={{ __html: l.svg }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/design/sources/preview?brand=${encodeURIComponent(brand)}&path=${encodeURIComponent(l.path)}&size=240`} alt="" />
                    )}
                    <span className="ds-folder-name">{suggested(l.path) ?? name(l.path)}</span>
                  </button>
                ))}
              </div>
              {selectedLogo && (
                <>
                  {(picks?.wordmark?.path === selectedLogo || picks?.mark?.path === selectedLogo) && (
                    <p className="ds-prop-hint">
                      {picks?.wordmark?.path === selectedLogo ? picks.wordmark?.why : picks?.mark?.why}
                    </p>
                  )}
                  <div className="ds-add-actions">
                    <button
                      type="button"
                      className="btn-ink"
                      disabled={busy !== null}
                      onClick={() => use({ as: 'wordmark', path: selectedLogo }, 'logo', `${name(selectedLogo)} is now the wordmark.`)}
                    >
                      Use as the wordmark
                    </button>
                    <button
                      type="button"
                      className="btn-quiet"
                      disabled={busy !== null}
                      onClick={() => use({ as: 'mark', path: selectedLogo }, 'logo', `${name(selectedLogo)} is now the symbol.`)}
                    >
                      Use as the symbol
                    </button>
                    <span className="ds-prop-hint">{where(selectedLogo)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {fonts.length > 0 && (
            <div className="ds-folder-group">
              <h3>Fonts</h3>
              <ul className="ds-folder-fonts">
                {orderedFonts.map((f) => (
                  <li key={f.path}>
                    <span>
                      <b>{f.family ?? name(f.path)}</b> {f.style && <span className="ds-prop-hint">{f.style}</span>}
                      {fontRole(f.path) && <span className="ds-badge">{fontRole(f.path)}</span>}
                      <span className="ds-prop-hint ds-folder-path">{f.path}</span>
                    </span>
                    <span className="ds-add-actions">
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={busy !== null}
                        onClick={() =>
                          use(
                            { as: 'font-sans', path: f.path, family: (picks?.headlineFont?.path === f.path && picks.headlineFont.family) || f.family, weight: f.weight },
                            'font',
                            `${f.family ?? name(f.path)} is now the headline font.`,
                          )
                        }
                      >
                        Use for headlines
                      </button>
                      <button
                        type="button"
                        className="btn-quiet"
                        disabled={busy !== null}
                        onClick={() =>
                          use(
                            { as: 'font-mono', path: f.path, family: (picks?.detailFont?.path === f.path && picks.detailFont.family) || f.family, weight: f.weight },
                            'font',
                            `${f.family ?? name(f.path)} is now the detail font.`,
                          )
                        }
                      >
                        Use for details
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="ds-prop-hint">Check the brand&rsquo;s font licence allows using these on the web.</p>
            </div>
          )}

          {photos.length > 0 && (
            <div className="ds-folder-group">
              <h3>Photos</h3>
              <div className="ds-add-actions">
                <button type="button" className="btn-ink" disabled={busy !== null || chosen.size === 0} onClick={addPhotos}>
                  {busy === 'photos' ? 'Adding…' : chosen.size ? `Add ${plural(chosen.size, 'photo', 'photos')} to the image library` : 'Add photos to the image library'}
                </button>
                <button type="button" className="btn-quiet" onClick={() => setChosen(new Set(photos.slice(0, 40).map((p) => p.path)))}>
                  Tick all
                </button>
                <button type="button" className="btn-quiet" onClick={() => setChosen(new Set())}>
                  Untick all
                </button>
              </div>
              <ul className="ds-folder-photos">
                {(allPhotos ? photos : photos.slice(0, SHOW_PHOTOS)).map((p) => {
                  const pick = pickedPhoto.get(p.path);
                  return (
                    <li key={p.path}>
                      <label>
                        <input type="checkbox" checked={chosen.has(p.path)} onChange={() => toggle(p.path)} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          loading="lazy"
                          src={`/api/design/sources/preview?brand=${encodeURIComponent(brand)}&path=${encodeURIComponent(p.path)}&size=360`}
                          alt={pick?.alt ?? name(p.path)}
                        />
                        <span className="ds-folder-name">
                          {pick ? <b>Suggested</b> : null} {pick?.alt ?? name(p.path)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!allPhotos && photos.length > SHOW_PHOTOS && (
                <button type="button" className="btn-quiet" onClick={() => setAllPhotos(true)}>
                  Show all {photos.length} photos
                </button>
              )}
              <p className="ds-prop-hint">
                Only add photos the brand has the right to use. Up to 40 at a time; they are resized for slides.
              </p>
            </div>
          )}

          {docs.length > 0 && (
            <div className="ds-folder-group">
              <h3>Documents</h3>
              <ul className="ds-folder-docs">
                {docs.map((d) => (
                  <li key={d.path}>{d.path}</li>
                ))}
              </ul>
              <p className="ds-prop-hint">The agent reads these when it searches, for colours, fonts and brand rules.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
