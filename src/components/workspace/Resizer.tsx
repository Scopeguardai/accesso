'use client';

import type { KeyboardEvent, PointerEvent } from 'react';

/**
 * A draggable divider between two columns. Drag it, or focus it and use the
 * arrow keys; double-click returns the column to its default width.
 */
export default function Resizer({
  which,
  label,
  value,
  min,
  max,
  onResize,
  onReset,
}: {
  which: 'projects' | 'conversation';
  label: string;
  /** Current width of the column to the left of the divider, if it has been set. */
  value?: number;
  min: number;
  max: number;
  /** Called with the pointer's x position while dragging, or a step in pixels from the keyboard. */
  onResize: (change: { x: number } | { step: number }) => void;
  onReset: () => void;
}) {
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // Capturing the pointer keeps the drag going over the presentation frame.
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.dragging = '';
    e.preventDefault();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize({ x: e.clientX });
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    delete e.currentTarget.dataset.dragging;
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') onResize({ step: -step });
    else if (e.key === 'ArrowRight') onResize({ step });
    else if (e.key === 'Enter') onReset();
    else return;
    e.preventDefault();
  }
  return (
    <div
      className="resizer"
      data-which={which}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  );
}
