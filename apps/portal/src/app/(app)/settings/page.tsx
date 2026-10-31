'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { Printer } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/spinner';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { firestore } from '@/lib/firebase';
import type { AttendanceMode } from '@/lib/types';

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
 * Owner-only restaurant settings.
 *
 * These are written straight to Firestore — the one place the portal does that
 * — because the security rules validate the whole `settings` map: the modes are
 * an enum, the thresholds are 0–1, and `faceReviewThreshold` must not exceed
 * `faceVerifyThreshold`. A bad value is rejected by the server, not just by the
 * form.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { restaurant, isOwner, loading } = useAuth();
  const toast = useToast();

  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState('Asia/Karachi');
  const [attendanceMode, setAttendanceMode] = React.useState<AttendanceMode>('both');
  const [verify, setVerify] = React.useState(0.75);
  const [review, setReview] = React.useState(0.6);
  const [requireMarker, setRequireMarker] = React.useState(true);
  const [grace, setGrace] = React.useState(10);
  const [busy, setBusy] = React.useState(false);

  // Seed the form once the restaurant document arrives.
  React.useEffect(() => {
    if (!restaurant) return;
    setName(restaurant.name);
    setTimezone(restaurant.timezone);
    setAttendanceMode(restaurant.settings.attendanceMode);
    setVerify(restaurant.settings.faceVerifyThreshold);
    setReview(restaurant.settings.faceReviewThreshold);
    setRequireMarker(restaurant.settings.requireMarker);
    setGrace(restaurant.settings.lateGraceMinutes);
  }, [restaurant]);

  React.useEffect(() => {
    if (!loading && !isOwner) router.replace('/dashboard');
  }, [loading, isOwner, router]);

  if (loading || !restaurant) return <Spinner label="Loading settings..." full />;
  if (!isOwner) return <Spinner label="Redirecting..." full />;

  const thresholdsInvalid = review > verify;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (thresholdsInvalid) return;
    setBusy(true);
    try {
      await updateDoc(doc(firestore(), 'restaurants', restaurant!.id), {
        name: name.trim(),
        timezone,
        settings: {
          attendanceMode,
          faceVerifyThreshold: verify,
          faceReviewThreshold: review,
          requireMarker,
          lateGraceMinutes: grace,
        },
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(
        'Could not save settings',
        (err as Error).message.includes('permission')
          ? 'Only the owner can change settings, and the values must be in range.'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Owner only. These apply to every employee in this restaurant."
        action={
          <Button variant="outline" asChild>
            <Link href="/settings/poster">
              <Printer className="h-4 w-4" />
              Check-in poster
            </Link>
          </Button>
        }
      />

      <form onSubmit={save} className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Restaurant</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                minLength={2}
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
                Changing this changes how existing records are *displayed*, not
                the `localDate` already stored on them.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check-in</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mode">Allowed methods</Label>
              <Select
                id="mode"
                value={attendanceMode}
                onChange={(e) => setAttendanceMode(e.target.value as AttendanceMode)}
              >
                <option value="both">Face and manual</option>
                <option value="face">Face only</option>
                <option value="manual">Manual only</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Manual check-in is one tap and easy to fake. Face only is the
                strongest setting, but an employee whose enrolment is not approved
                yet cannot check in at all.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="font-medium">Require the check-in poster</p>
                <p className="text-xs text-muted-foreground">
                  The restaurant&apos;s QR poster must be visible in the photo.
                  This is what proves the employee was physically here — turning
                  it off means a face check-in could be done from anywhere.
                </p>
              </div>
              <Switch
                checked={requireMarker}
                onCheckedChange={setRequireMarker}
                aria-label="Require the check-in poster"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grace">Late grace period (minutes)</Label>
              <Input
                id="grace"
                type="number"
                min={0}
                max={240}
                required
                value={grace}
                onChange={(e) => setGrace(Number(e.target.value))}
                className="max-w-[8rem]"
              />
              <p className="text-xs text-muted-foreground">
                Checking in within this many minutes of their scheduled start is
                not flagged late.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Face matching thresholds</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Cosine similarity between the check-in photo and the approved
              enrolment. At or above the verify threshold the check-in is accepted
              automatically; between the two it goes to review; below the review
              threshold it is rejected.
            </p>

            <ThresholdField
              id="verify"
              label="Verify at or above"
              value={verify}
              onChange={setVerify}
            />
            <ThresholdField
              id="review"
              label="Send to review at or above"
              value={review}
              onChange={setReview}
            />

            {thresholdsInvalid && (
              <p role="alert" className="text-sm text-destructive">
                The review threshold cannot be higher than the verify threshold —
                there would be no band left to review.
              </p>
            )}

            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              These defaults are placeholders. They depend on the model you
              bundled, so they must be measured: run the app with{' '}
              <code className="font-mono">--dart-define=DEBUG_SIMILARITY=true</code>{' '}
              and follow the calibration steps in{' '}
              <code className="font-mono">apps/mobile/assets/models/MODEL.md</code>.
            </div>
          </CardContent>
        </Card>

        <div>
          <Button type="submit" disabled={busy || thresholdsInvalid}>
            {busy ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </form>
    </>
  );
}

function ThresholdField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm font-medium tabular-nums">
          {value.toFixed(2)} ({(value * 100).toFixed(0)}%)
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}
