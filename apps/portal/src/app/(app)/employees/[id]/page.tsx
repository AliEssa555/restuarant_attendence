'use client';

import { FACE_RECOGNITION_ENABLED } from '@/lib/features';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { EnrolmentReviewCard } from '@/components/enrolment-review-card';
import { FaceStatusBadge, MethodBadge, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useAuth, useTimezone } from '@/lib/auth-context';
import { setEmployeeActive } from '@/lib/callables';
import { dateTimeIn, lateLabel, similarityLabel, toDate } from '@/lib/format';
import { firestore } from '@/lib/firebase';
import { useAttendance, useEmployee } from '@/lib/hooks';
import { callableErrorMessage, reasonLabel } from '@/lib/reason-codes';
import type { Employee } from '@/lib/types';

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params?.id ?? null;
  const { data: employee, loading } = useEmployee(employeeId);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full max-w-xl" />
      </div>
    );
  }

  if (!employee) {
    return (
      <>
        <PageHeader title="Employee not found" />
        <Button variant="outline" asChild>
          <Link href="/employees">
            <ArrowLeft className="h-4 w-4" />
            Back to employees
          </Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={employee.name}
        description={employee.position ?? employee.email}
        action={
          <Button variant="outline" asChild>
            <Link href="/employees">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard employee={employee} />
        <div className="flex flex-col gap-6">
          <AccountCard employee={employee} />
          {FACE_RECOGNITION_ENABLED && <EnrolmentReviewCard employee={employee} />}
        </div>
      </div>

      <RecentAttendance employeeId={employee.id} />
    </>
  );
}

/** Name, role, phone and shift start — the only client-writable fields. */
function ProfileCard({ employee }: { employee: Employee }) {
  const { claims } = useAuth();
  const toast = useToast();
  const [name, setName] = React.useState(employee.name);
  const [position, setPosition] = React.useState(employee.position ?? '');
  const [phone, setPhone] = React.useState(employee.phone ?? '');
  const [scheduledStart, setScheduledStart] = React.useState(
    employee.scheduledStart ?? '',
  );
  const [busy, setBusy] = React.useState(false);

  const dirty =
    name !== employee.name ||
    position !== (employee.position ?? '') ||
    phone !== (employee.phone ?? '') ||
    scheduledStart !== (employee.scheduledStart ?? '');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!claims.restaurantId) return;
    setBusy(true);
    try {
      // One of only two direct client writes in the portal; the security rules
      // whitelist exactly these four fields on an employee document.
      await updateDoc(
        doc(
          firestore(),
          'restaurants',
          claims.restaurantId,
          'employees',
          employee.id,
        ),
        {
          name: name.trim(),
          position: position.trim() || null,
          phone: phone.trim() || null,
          scheduledStart: scheduledStart || null,
        },
      );
      toast.success('Saved');
    } catch (err) {
      toast.error('Could not save', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">Role</Label>
              <Input
                id="position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start">Scheduled start</Label>
            <Input
              id="start"
              type="time"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="max-w-[9rem]"
            />
          </div>
          <Button type="submit" disabled={busy || !dirty} className="self-start">
            {busy ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Login state, presence, and the active toggle. */
function AccountCard({ employee }: { employee: Employee }) {
  const tz = useTimezone();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const lastEvent = toDate(employee.presence?.lastEventAt);

  async function toggle(active: boolean) {
    setBusy(true);
    try {
      await setEmployeeActive({ employeeId: employee.id, active });
      toast.success(active ? 'Re-activated' : 'Deactivated');
    } catch (err) {
      toast.error('Could not change that', callableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <Field label="Email" value={employee.email} />
        <Field
          label="Status now"
          value={employee.presence?.status === 'in' ? 'Checked in' : 'Checked out'}
        />
        <Field
          label="Last event"
          value={lastEvent ? dateTimeIn(tz, lastEvent) : 'No activity yet'}
        />
        {FACE_RECOGNITION_ENABLED && (
        <Field
          label="Face enrolment"
          value={<FaceStatusBadge status={employee.face?.status ?? 'none'} />}
        />
        )}

        <div className="mt-2 flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <p className="font-medium">Active</p>
            <p className="text-xs text-muted-foreground">
              Turning this off disables their login, revokes any open session,
              and blocks check-in.
            </p>
          </div>
          <Switch
            checked={employee.active}
            disabled={busy}
            onCheckedChange={toggle}
            aria-label="Active"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** The employee's last records, newest first. */
function RecentAttendance({ employeeId }: { employeeId: string }) {
  const tz = useTimezone();
  const { data, loading, error } = useAttendance({ employeeId, limit: 25 });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Recent attendance</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-5 text-sm text-destructive">{error}</p>
        ) : data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No check-ins recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead>Result</TableHead>
                {FACE_RECOGNITION_ENABLED && <TableHead className="hidden md:table-cell">Match</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="whitespace-nowrap">
                    {dateTimeIn(tz, toDate(record.createdAt))}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap">
                      {record.type === 'check_in' ? 'Check in' : 'Check out'}
                    </span>
                    {record.late && (
                      <p className="text-xs text-warning">
                        {lateLabel(record.minutesLate)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <MethodBadge method={record.method} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={record.status} />
                    {record.status === 'rejected' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reasonLabel(record.rejectReason)}
                      </p>
                    )}
                  </TableCell>
                  {FACE_RECOGNITION_ENABLED && (<TableCell className="hidden md:table-cell tabular-nums">
                    {similarityLabel(record.face?.similarity)}
                  </TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
