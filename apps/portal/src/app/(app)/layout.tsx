'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/spinner';
import { useAuth } from '@/lib/auth-context';

/**
 * Client-side auth guard for every signed-in route.
 *
 * This is a usability gate, not the security boundary: anyone can edit the
 * JavaScript. The real enforcement is the Firestore security rules and the
 * `assertRole` check in every callable, both of which see the server-signed
 * claims rather than anything this component believes.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, isStaff } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isStaff) {
      // Signed in, but not staff of a restaurant: either an employee account
      // (which belongs in the mobile app) or an owner mid-onboarding.
      router.replace('/signup?step=restaurant');
    }
  }, [loading, user, isStaff, router]);

  if (loading) return <Spinner label="Loading..." full />;
  if (!user || !isStaff) return <Spinner label="Redirecting..." full />;

  return <AppShell>{children}</AppShell>;
}
