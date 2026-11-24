'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The time used for "Today" groups and "5 min ago" labels.
 *
 * The server and the browser must render the same HTML, but they can sit in
 * different time zones and render a moment apart. So the first render uses
 * the time the server rendered at, counted in UTC, on both sides; once the
 * page is running in the browser it switches to the browser's own clock and
 * time zone, and refreshes every minute.
 */
export type Clock = { now: number; local: boolean };

const ClockContext = createContext<Clock>({ now: 0, local: false });

export function ClockProvider({ renderedAt, children }: { renderedAt: number; children: ReactNode }) {
  const [clock, setClock] = useState<Clock>({ now: renderedAt, local: false });
  useEffect(() => {
    const tick = () => setClock({ now: Date.now(), local: true });
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

export const useClock = () => useContext(ClockContext);

/** Midnight at the start of the day `now` falls in, locally or in UTC. */
export function startOfDay({ now, local }: Clock): number {
  const d = new Date(now);
  if (local) d.setHours(0, 0, 0, 0);
  else d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
