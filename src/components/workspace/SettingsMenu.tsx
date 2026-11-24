'use client';

import { useEffect, useRef, useState } from 'react';
import type { BrandOption } from '@/lib/workspace';
import { IconUser } from './icons';

const NAME_KEY = 'accesso_profile_name';

/**
 * The settings button at the bottom of the projects column. Its menu holds
 * the profile and the brand. There are no accounts yet, so the profile is
 * a display name remembered in this browser.
 */
export default function SettingsMenu({
  brands,
  brandId,
  onBrand,
  brandLocked,
}: {
  brands: BrandOption[];
  brandId: string;
  onBrand: (id: string) => void;
  brandLocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const brand = brands.find((b) => b.id === brandId);

  useEffect(() => {
    try {
      setName(window.localStorage.getItem(NAME_KEY) ?? '');
    } catch {
      // Storage is unavailable in some browser modes; the name just won't be remembered.
    }
  }, []);

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

  function rename(value: string) {
    setName(value);
    try {
      if (value.trim()) window.localStorage.setItem(NAME_KEY, value.trim());
      else window.localStorage.removeItem(NAME_KEY);
    } catch {
      // See above.
    }
  }

  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <div className="settings" ref={wrap}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Profile and settings"
        title="Profile and settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {initial ? <span className="avatar avatar-sm">{initial}</span> : <IconUser />}
      </button>
      {open && (
        <div className="settings-menu" role="dialog" aria-label="Settings">
          <div className="settings-profile">
            <span className="avatar" aria-hidden="true">
              {initial || <IconUser />}
            </span>
            <label>
              <span className="settings-label">Profile</span>
              <input
                value={name}
                onChange={(e) => rename(e.target.value)}
                placeholder="Your name"
                maxLength={60}
                autoComplete="name"
              />
            </label>
          </div>
          <div className="settings-row">
            <span className="settings-label">Brand</span>
            {brands.length > 1 ? (
              <select
                value={brandId}
                onChange={(e) => onBrand(e.target.value)}
                disabled={brandLocked}
                aria-label="Brand"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{brand?.name}</strong>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
