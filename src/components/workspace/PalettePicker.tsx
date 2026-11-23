'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { BrandOption } from '@/lib/workspace';
import { IconChevron } from './icons';

type Palette = BrandOption['palettes'][number];

const Swatch = ({ p }: { p?: Palette }) =>
  p ? (
    <span className="swatch" aria-hidden="true">
      <span style={{ background: p.dark }} />
      <span style={{ background: p.accent }} />
      <span style={{ background: p.light }} />
    </span>
  ) : (
    <span className="swatch swatch-auto" aria-hidden="true" />
  );

/**
 * A compact palette menu for the message box. `allowAuto` adds a
 * "Let the agent choose" option (value ''), used when starting a deck.
 */
export default function PalettePicker({
  palettes,
  value,
  onChange,
  allowAuto = false,
  disabled = false,
}: {
  palettes: Palette[];
  value: string;
  onChange: (key: string) => void;
  allowAuto?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = palettes.find((p) => p.key === value);
  const shortLabel = (p?: Palette) => (p ? p.label.replace(/\s*\(.*\)$/, '') : 'Any palette');

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (key: string) => {
    setOpen(false);
    if (key !== value) onChange(key);
  };

  return (
    <div className="picker" ref={wrap}>
      <button
        type="button"
        className="chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Colour palette"
        aria-label={`Colour palette: ${current ? current.label : 'agent chooses'}`}
      >
        <Swatch p={current} />
        <span className="chip-label">{shortLabel(current)}</span>
        <IconChevron width={16} height={16} />
      </button>
      {open && (
        <ul className="menu" role="listbox" id={listId} aria-label="Colour palette">
          {allowAuto && (
            <li>
              <button type="button" role="option" aria-selected={value === ''} onClick={() => choose('')}>
                <Swatch />
                <span>Let the agent choose</span>
              </button>
            </li>
          )}
          {palettes.map((p) => (
            <li key={p.key}>
              <button type="button" role="option" aria-selected={p.key === value} onClick={() => choose(p.key)}>
                <Swatch p={p} />
                <span>{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
