'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { AlertCircle, Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { firebaseAuth, isFirebaseConfigured } from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const { loading, user, isStaff, refreshClaims, signOut } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Already signed in? Go where they belong.
  React.useEffect(() => {
    if (loading || !user) return;
    router.replace(isStaff ? '/dashboard' : '/signup?step=restaurant');
  }, [loading, user, isStaff, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      const claims = await refreshClaims();
      if (claims.role === 'employee') {
        await signOut();
        setError(
          'This is an employee account. Employees check in with the mobile app.',
        );
        return;
      }
      router.replace(claims.restaurantId ? '/dashboard' : '/signup?step=restaurant');
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Clock className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-xl font-semibold">Manager portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to manage your restaurant&apos;s attendance.
          </p>
        </div>

        {!isFirebaseConfigured() && (
          <div className="mb-4 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              Firebase is not configured. Copy{' '}
              <code className="font-mono text-xs">.env.local.example</code> to{' '}
              <code className="font-mono text-xs">.env.local</code> and restart.
            </span>
          </div>
        )}

        <Card>
          <CardContent className="pt-5">
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy}>
                {busy ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          New restaurant?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

function authMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection to Firebase. Is the emulator running?';
    default:
      return 'Could not sign in. Try again.';
  }
}
