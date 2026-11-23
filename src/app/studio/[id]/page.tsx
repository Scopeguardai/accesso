import Link from 'next/link';
import { notFound } from 'next/navigation';
import Studio from '@/components/Studio';
import { readDeck } from '@/lib/deck/store';
import '../../app.css';

export const dynamic = 'force-dynamic';

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? readDeck(id) : null;
  if (!deck) notFound();
  return (
    <div className="app">
      <header className="app-header">
        <Link href="/" className="app-name">
          Accesso
        </Link>
        <span className="spacer" />
        <a className="btn ghost small" href={`/d/${deck.id}`} target="_blank" rel="noreferrer">
          Open presentation
        </a>
      </header>
      <Studio initial={deck} />
    </div>
  );
}
