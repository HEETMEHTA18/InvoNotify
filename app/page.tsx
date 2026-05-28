import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import LandingPage from '@/app/landing/page';

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
