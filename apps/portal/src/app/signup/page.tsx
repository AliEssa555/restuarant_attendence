'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/spinner';
import { useAuth } from '@/lib/auth-context';
import { createRestaurant } from '@/lib/callables';
import { callableErrorMessage } from '@/lib/reason-codes';
import { firebaseAuth } from '@/lib/firebase';

/** A short list, with Pakistan first — this demo's intended deployment. */
const TIMEZONES = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Riyadh',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

/**
 * Owner sign-up, in two steps: create the Firebase account, then create the
 * restaurant.
 *
 * They are separate because `createRestaurant` needs an authenticated caller to
 * attach the owner claims to. Landing here with `?step=restaurant` is also how
 * `(app)/layout.tsx` recovers someone whose account exists but whose restaurant
 * was never created — otherwise they would sit in a redirect loop.
 */
/**
 * `useSearchParams` opts a page out of static prerendering unless it sits inside
 * a Suspense boundary, so the part that reads it is split out.
 */
export default function SignupPage() {
  return (
    <React.Suspense fallback={<Spinner label="Loading..." full />}>
      <SignupFlow />
    </React.Suspense>
  );
}

function SignupFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, user, isStaff, refreshClaims } = useAuth();

  const [step, setStep] = React.useState<'account' | 'restaurant'>(
    params.get('step') === 'restaurant' ? 'restaurant' : 'account',
  );

  React.useEffect(() => {
    if (loading) return;
    if (isStaff) router.replace('/dashboard');
    else if (user) setStep('restaurant');
  }, [loading, user, isStaff, router]);

  if (loading) return <Spinner label="Loading..." full />;

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Clock className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-xl font-semibold">
            {step === 'account' ? 'Create your account' : 'Set up your restaurant'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === 'account'
              ? 'You will be the owner of this restaurant.'
              : 'This is used for the attendance log and the printed poster.'}
          </p>
        </div>

        <Card>
          <CardContent className="pt-5">
            {step === 'account' ? (
              <AccountStep onDone={() => setStep('restaurant')} />
            ) : (
              <RestaurantStep
                onDone={async () => {
                  await refreshClaims();
                  router.replace('/dashboard');
                }}
              />
            )}
          </CardContent>
        </Card>

        {step === 'account' && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function AccountStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth(),
        email.trim(),
        password,
      );
      await updateProfile(credential.user, { displayName: name.trim() });
      onDone();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === 'auth/email-already-in-use'
          ? 'That email is already registered. Sign in instead.'
          : code === 'auth/weak-password'
            ? 'Use at least 8 characters.'
            : 'Could not create the account. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating...' : 'Continue'}
      </Button>
    </form>
  );
}

function RestaurantStep({ onDone }: { onDone: () => Promise<void> }) {
  const { user } = useAuth();
  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState('Asia/Karachi');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createRestaurant({
        name: name.trim(),
        timezone,
        displayName: user?.displayName ?? undefined,
      });
      await onDone();
    } catch (err) {
      setError(callableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="restaurant">Restaurant name</Label>
        <Input
          id="restaurant"
          required
          minLength={2}
          placeholder="e.g. Karachi Grill"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          All shift times, late flags and daily totals use this timezone.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating...' : 'Create restaurant'}
      </Button>
    </form>
  );
}
