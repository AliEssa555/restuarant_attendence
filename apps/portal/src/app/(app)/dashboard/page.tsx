'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardCheck,
  Clock3,
  LogIn,
  UserCheck,
  UserMinus,
} from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { MethodBadge, PresenceBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth, useTimezone } from '@/lib/auth-context';
import { durationSince, lateLabel, localDateIn, timeIn, toDate } from '@/lib/format';
import { useAttendance, useEmployees } from '@/lib/hooks';
import type { AttendanceRecord, Employee } from '@/lib/types';

/**
 * Today at a glance, in the restaurant's timezone.
 *
 * Everything here is a live `onSnapshot`, because this page is meant to be left
 * open on a counter or a back-office screen during service.
 */
export default function DashboardPage() {
  const tz = useTimezone();
  const { restaurant } = useAuth();
  const employees = useEmployees();

  // "Today" is the restaurant's local date, which is exactly what the server
  // stamped onto each record as `localDate` — so this needs no range query.
  const today = React.useMemo(() => localDateIn(tz), [tz]);
  const todayRecords = useAttendance({ localDate: today, limit: 500 });
  const pendingRecords = useAttendance({ status: 'pending_review', limit: 100 });

  const rows = React.useMemo(
    () => buildRows(employees.data, todayRecords.data),
    [employees.data, todayRecords.data],
  );

  const pendingEnrolments = employees.data.filter(
    (e) => e.face?.status === 'pending',
  ).length;

  const inNow = rows.filter((r) => r.employee.presence?.status === 'in').length;
  const checkedInToday = rows.filter((r) => r.firstCheckIn).length;
  const lateToday = rows.filter((r) => r.firstCheckIn?.late).length;
  const notInYet = rows.filter(
    (r) => r.employee.active && !r.firstCheckIn,
  ).length;

  const loading = employees.loading || todayRecords.loading;

  return (
    <>
      <PageHeader
        title="Today"
        description={
          restaurant
            ? `${restaurant.name} · ${today} (${tz})`
            : 'Loading restaurant...'
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="In now" value={inNow} icon={UserCheck} loading={loading} />
        <StatCard
          label="Checked in today"
          value={checkedInToday}
          icon={LogIn}
          loading={loading}
        />
        <StatCard
          label="Late"
          value={lateToday}
          icon={Clock3}
          tone={lateToday > 0 ? 'warning' : undefined}
          loading={loading}
        />
        <StatCard
          label="Not in yet"
          value={notInYet}
          icon={UserMinus}
          loading={loading}
        />
        <StatCard
          label="Pending reviews"
          value={pendingRecords.data.length + pendingEnrolments}
          icon={ClipboardCheck}
          tone={
            pendingRecords.data.length + pendingEnrolments > 0 ? 'warning' : undefined
          }
          href="/reviews"
          loading={loading || pendingRecords.loading}
        />
      </div>

      {todayRecords.error && (
        <div className="mb-4 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            Could not load today&apos;s attendance: {todayRecords.error}. If this
            mentions an index, run <code className="font-mono">firebase deploy
            --only firestore:indexes</code>.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium">No employees yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link href="/employees/new" className="text-primary hover:underline">
                  Add your first employee
                </Link>{' '}
                to start tracking attendance.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>First in</TableHead>
                  <TableHead className="hidden sm:table-cell">Last out</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <DashboardRow key={row.employee.id} row={row} tz={tz} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** One employee's day, assembled from today's records. */
interface Row {
  employee: Employee;
  firstCheckIn: AttendanceRecord | null;
  lastCheckOut: AttendanceRecord | null;
}

/**
 * Rejected records are excluded: a rejected attempt never moved presence, so
 * counting it as "checked in" would overstate the day. Records arrive newest
 * first, so the *last* matching check-in in the list is the first of the day.
 */
function buildRows(employees: Employee[], records: AttendanceRecord[]): Row[] {
  const byEmployee = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    if (record.status === 'rejected') continue;
    const list = byEmployee.get(record.employeeId);
    if (list) list.push(record);
    else byEmployee.set(record.employeeId, [record]);
  }

  return employees.map((employee) => {
    const mine = byEmployee.get(employee.id) ?? [];
    const checkIns = mine.filter((r) => r.type === 'check_in');
    const checkOuts = mine.filter((r) => r.type === 'check_out');
    return {
      employee,
      firstCheckIn: checkIns.length ? checkIns[checkIns.length - 1] : null,
      lastCheckOut: checkOuts.length ? checkOuts[0] : null,
    };
  });
}

function DashboardRow({ row, tz }: { row: Row; tz: string }) {
  const { employee, firstCheckIn, lastCheckOut } = row;
  const inAt = toDate(firstCheckIn?.createdAt);
  const outAt = toDate(lastCheckOut?.createdAt);
  const isIn = employee.presence?.status === 'in';

  return (
    <TableRow className={employee.active ? undefined : 'opacity-55'}>
      <TableCell>
        <Link
          href={`/employees/${employee.id}`}
          className="font-medium hover:underline"
        >
          {employee.name}
        </Link>
        {employee.position && (
          <p className="text-xs text-muted-foreground">{employee.position}</p>
        )}
        {!employee.active && (
          <Badge variant="outline" className="mt-1">
            Inactive
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <PresenceBadge status={isIn ? 'in' : 'out'} />
          {isIn && inAt && (
            <span className="text-xs text-muted-foreground">
              {durationSince(inAt)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {inAt ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="tabular-nums">{timeIn(tz, inAt)}</span>
            {firstCheckIn?.late && (
              <Badge variant="warning">{lateLabel(firstCheckIn.minutesLate)}</Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {outAt ? (
          <span className="tabular-nums">{timeIn(tz, outAt)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {firstCheckIn ? (
          <MethodBadge method={firstCheckIn.method} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  href,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'warning';
  href?: string;
  loading?: boolean;
}) {
  const body = (
    <Card className={tone === 'warning' ? 'border-warning/40' : undefined}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={
            tone === 'warning'
              ? 'rounded-md bg-warning/10 p-2 text-warning'
              : 'rounded-md bg-muted p-2 text-muted-foreground'
          }
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-10" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums leading-tight">
              {value}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}
