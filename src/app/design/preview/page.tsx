import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DeckView from '@/components/DeckView';
import '@/components/deck.css';
import { listBrands, loadBrand } from '@/lib/brand/load';
import { designChoiceSchema, resolveDesign } from '@/lib/brand/looks';
import type { Deck, Slide } from '@/lib/deck/schema';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Design preview', robots: { index: false } };

/**
 * A sample deck drawn in a brand's colours, fonts and logo with any look and options,
 * so a design can be judged before it is chosen. Nothing is saved. The wording is
 * placeholder text about the layouts themselves, not about the brand.
 */
export default async function DesignPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  if (!q.brand || !listBrands().includes(q.brand)) notFound();
  const brand = loadBrand(q.brand);
  const choice = designChoiceSchema.safeParse({ look: q.look, cover: q.cover, corners: q.corners, headings: q.headings });
  const design = choice.success ? resolveDesign(choice.data) : brand.design;
  const palette = q.palette && brand.palettes[q.palette] ? q.palette : brand.defaultPalette;
  const photo = brand.images.find((i) => i.orientation === 'landscape') ?? brand.images[0];
  const second = brand.images.find((i) => i !== photo);

  const slides: Slide[] = [
    { id: 's1', layout: 'cover', title: 'A presentation title set in this design', subtitle: brand.tagline || 'A short line under the title' },
    {
      id: 's2',
      layout: 'agenda',
      title: 'Contents',
      items: [
        { title: 'Where we are', note: 'Part one' },
        { title: 'What we propose', note: 'Part two' },
        { title: 'What happens next', note: 'Part three' },
      ],
    },
    { id: 's3', layout: 'section', label: 'Part one', title: 'Where we are', body: 'A section slide opens each part of the presentation with a few words.', ...(second ? { image: { asset: second.id } } : {}) },
    {
      id: 's4',
      layout: 'statement',
      label: 'Statement',
      heading: 'One clear claim, set large, with a short paragraph to back it up',
      body: 'A statement slide carries a single idea. The paragraph explains it in two or three plain sentences.',
      stat: { value: '42%', label: 'An optional figure' },
    },
    {
      id: 's5',
      layout: 'stats',
      label: 'Figures',
      heading: 'Two to four figures side by side',
      body: 'Each figure has a short label and, if needed, a note.',
      stats: [
        { value: '120', label: 'First figure', note: 'A note about it' },
        { value: '3.5x', label: 'Second figure' },
        { value: '18', label: 'Third figure', note: 'Another note' },
      ],
    },
    {
      id: 's6',
      layout: 'list',
      label: 'List',
      heading: 'Short rows, each a title and a line',
      items: [
        { title: 'First point', body: 'A sentence that explains the first point.' },
        { title: 'Second point', body: 'A sentence that explains the second point.' },
        { title: 'Third point', body: 'A sentence that explains the third point.' },
      ],
    },
    ...(photo
      ? ([
          {
            id: 's7',
            layout: 'split',
            label: 'Text and picture',
            heading: 'Text on one side, a picture on the other',
            body: 'A split slide pairs a short explanation with one image from the brand’s library.',
            bullets: ['A first supporting point', 'A second supporting point'],
            image: { asset: photo.id },
            imageSide: 'right',
          },
        ] as Slide[])
      : []),
    {
      id: 's8',
      layout: 'timeline',
      label: 'Timeline',
      heading: 'Three to five steps in order',
      steps: [
        { label: 'Step 1', title: 'Begin', body: 'What happens first.' },
        { label: 'Step 2', title: 'Build', body: 'What happens next.' },
        { label: 'Step 3', title: 'Launch', body: 'Where it ends up.' },
      ],
    },
    { id: 's9', layout: 'quote', quote: 'A quotation slide holds one sourced quote, set large enough to read from the back of the room.', name: 'Name of the person', role: 'Their role' },
    { id: 's10', layout: 'bigNumber', value: '7 in 10', caption: 'One very large figure', body: 'Used once in a presentation, for the number people should remember.' },
    { id: 's11', layout: 'closing', title: 'Thank you', contacts: [{ label: 'Email', value: 'name@example.com' }, { label: 'Web', value: brand.website || 'example.com' }] },
  ];

  const now = new Date(0).toISOString();
  const deck: Deck = {
    id: 'preview',
    brand: brand.id,
    client: brand.id,
    title: 'Design preview',
    palette,
    status: 'ready',
    brief: { prompt: 'Design preview', audience: '', goal: '', slideCount: slides.length, tone: '' },
    outline: [],
    slides,
    suggestions: [],
    thread: [],
    createdAt: now,
    updatedAt: now,
  };
  return <DeckView deck={deck} brand={{ ...brand, design }} />;
}
