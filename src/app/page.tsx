import Link from 'next/link';
import BriefForm from '@/components/BriefForm';
import { listBrands, loadBrand } from '@/lib/brand/load';
import { listDecks } from '@/lib/deck/store';
import './app.css';

export const dynamic = 'force-dynamic';

export default function Home() {
  const brands = listBrands().map((id) => {
    const b = loadBrand(id);
    return {
      id,
      name: b.name,
      defaultPalette: b.defaultPalette,
      palettes: Object.entries(b.palettes).map(([key, p]) => ({ key, label: p.label })),
    };
  });
  const decks = listDecks();

  return (
    <div className="app">
      <header className="app-header">
        <Link href="/" className="app-name">
          Accesso
        </Link>
      </header>
      <main className="home">
        <section>
          <h1>New presentation</h1>
          <p className="intro">
            Describe what the deck is for. The agent plans the story from the knowledge base, designs
            it in the brand style, and gives you a link you can open on any screen.
          </p>
          <BriefForm brands={brands} />
        </section>
        <section>
          <h2>Presentations</h2>
          {decks.length === 0 ? (
            <p className="intro">Nothing here yet.</p>
          ) : (
            <ul className="decklist">
              {decks.map((d) => (
                <li key={d.id}>
                  <Link href={`/studio/${d.id}`}>
                    <strong>{d.title}</strong>
                    <div className="meta">
                      {d.slides.length} slides · updated{' '}
                      {new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{' '}
                      <span className={`chip ${d.status}`}>{d.status}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
