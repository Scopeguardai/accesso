'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type BrandOption = {
  id: string;
  name: string;
  defaultPalette: string;
  palettes: { key: string; label: string }[];
};

export default function BriefForm({ brands }: { brands: BrandOption[] }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const brand = brands.find((b) => b.id === brandId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand: brandId,
          brief: {
            topic: text('topic'),
            audience: text('audience'),
            goal: text('goal'),
            tone: text('tone'),
            mustInclude: text('mustInclude'),
            slideCount: Number(f.get('slideCount')) || 8,
            palette: text('palette') || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start the deck.');
      router.push(`/studio/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!brand) return <p className="error">No brand pack found in the brands folder.</p>;

  return (
    <form className="form" onSubmit={submit}>
      {brands.length > 1 && (
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="topic">What is the presentation about?</label>
        <input id="topic" name="topic" required maxLength={200} placeholder={`e.g. Introducing ${brand.name} to infrastructure investors`} />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="audience">Audience</label>
          <input id="audience" name="audience" maxLength={200} placeholder="Who will read or watch it" />
        </div>
        <div className="field">
          <label htmlFor="goal">Goal</label>
          <input id="goal" name="goal" maxLength={300} placeholder="What they should do afterwards" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="mustInclude">Points to include</label>
        <textarea id="mustInclude" name="mustInclude" maxLength={4000} placeholder="Facts, figures, messages or sections the deck must carry. Anything written here overrides the knowledge base." />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="slideCount">Slides</label>
          <input id="slideCount" name="slideCount" type="number" min={3} max={20} defaultValue={8} />
        </div>
        <div className="field">
          <label htmlFor="palette">Palette</label>
          <select id="palette" name="palette" defaultValue="">
            <option value="">Let the agent choose</option>
            {brand.palettes.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="tone">Tone</label>
        <input id="tone" name="tone" maxLength={120} placeholder="Optional. Defaults to the brand voice" />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div>
        <button className="btn" disabled={busy}>
          {busy ? 'Starting…' : 'Create presentation'}
        </button>
      </div>
    </form>
  );
}
