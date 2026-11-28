import { NextResponse } from 'next/server';
import { RemoveError, restoreBrand } from '@/lib/brand/remove';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Put a deleted brand back. Body: { trash: "<id from the recycle folder>" }. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { trash?: unknown } | null;
  try {
    return NextResponse.json({ id: restoreBrand(typeof body?.trash === 'string' ? body.trash : '') });
  } catch (err) {
    if (err instanceof RemoveError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
