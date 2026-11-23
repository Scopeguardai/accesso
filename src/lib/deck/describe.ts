import type { Slide } from './schema';

/** A short human name for a slide, for lists and scope labels. Safe to use in the browser. */
export function slideName(s: Slide): string {
  switch (s.layout) {
    case 'cover':
      return s.title ?? 'Cover';
    case 'agenda':
    case 'section':
    case 'closing':
    case 'photo':
      return s.title;
    case 'statement':
    case 'split':
    case 'stats':
    case 'list':
    case 'gallery':
    case 'timeline':
      return s.heading;
    case 'quote':
      return s.name ? `Quote from ${s.name}` : 'Quote';
    case 'bigNumber':
      return `${s.value} ${s.caption}`;
  }
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "14 Nov". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
