import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The knowledge base now sits inside each brand's design system; old links are sent there. */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ entry?: string; brand?: string; tab?: string }> }) {
  const { entry, brand, tab } = await searchParams;
  const params = new URLSearchParams();
  if (brand) params.set('brand', brand);
  params.set('tab', tab === 'styles' ? 'styles' : 'knowledge');
  if (entry) params.set('entry', entry);
  redirect(`/design?${params.toString()}`);
}
