'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/spinner';

/**
 * Entry point: send staff to the dashboard and everyone else to login.
 *
 * The guard lives here and in `(app)/layout.tsx` rather than in middleware,
 * because auth state is only known in the browser — the portal has no server
 * session (and no `firebase-admin`) by design.
 */
export default function Home() {
  const { loading, isStaff } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    router.replace(isStaff ? '/dashboard' : '/login');
  }, [loading, isStaff, router]);

  return <Spinner label="Loading..." full />;
}
