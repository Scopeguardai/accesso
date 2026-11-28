import LoginForm from '@/components/landing/LoginForm';
import { safeNext } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Voila' };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(next)} />;
}
