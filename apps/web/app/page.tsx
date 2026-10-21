import { cookies } from 'next/headers';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { LoginPage } from '@/features/auth/LoginPage';

async function getUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('reachinbox.sid');

  if (!sessionCookie) return null;

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/me`,
      {
        headers: { Cookie: `reachinbox.sid=${sessionCookie.value}` },
        cache: 'no-store',
      },
    );

    if (res.ok) {
      const data = await res.json();
      return data.data;
    }
  } catch {
    // The login screen remains available when the API is offline.
  }

  return null;
}

export default async function HomePage() {
  const user = await getUser();
  return user ? <Dashboard user={user} /> : <LoginPage />;
}
