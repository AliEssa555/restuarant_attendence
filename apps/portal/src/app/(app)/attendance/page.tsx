'use client';
import { FACE_RECOGNITION_ENABLED } from '@/lib/features';

import * as React from 'react';
import { Download } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { AttendanceDetailDialog } from '@/components/attendance-detail';
import { MethodBadge, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  dateTimeIn,
  inputDate,
  lateLabel,
  localDateIn,
  similarityLabel,
  timeIn,
  toDate,
} from '@/lib/format';
import { useAttendance, useEmployees } from '@/lib/hooks';
import { reasonLabel } from '@/lib/reason-codes';
import type { AttendanceRecord } from '@/lib/types';

/**
 * The full attendance log.
 *
 * Date range, employee and status are pushed into the Firestore query (they are
 * covered by the composite indexes). Method is filtered in memory: adding it to
 * the query would need another index per combination for one boolean choice.
 */
export default function AttendancePage() {
  const tz = useTimezone();
  const { restaurant } = useAuth();
  const employees = useEmployees();
  const toast = useToast();

  const today = localDateIn(tz);
  const weekAgo = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return inputDate(d);
  }, []);

  const [fromDate, setFromDate] = React.useState(weekAgo);
  const [toDateFilter, setToDateFilter] = React.useState(today);
  const [employeeId, setEmployeeId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [method, setMethod] = React.useState('');
  const [selected, setSelected] = React.useState<AttendanceRecord | null>(null);

  const { data, loading, error } = useAttendance({
    fromDate,
    toDate: toDateFilter,
    employeeId: employeeId || undefined,
    status: status || undefined,
    limit: 500,
  });

  const rows = React.useMemo(
    () => (method ? data.filter((r) => r.method === method) : data),
    [data, method],
  );

  function exportCsv() {
    if (rows.length === 0) {
      toast.error('Nothing to export', 'No rows match the current filters.');
      return;
    }
    download(
      toCsv(rows, tz),
      `attendance-${restaurant?.name ?? 'export'}-${fromDate}-to-${toDateFilter}.csv`,
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`All times in ${tz}. Click a row to see the evidence.`}
        action={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={fromDate}
              max={toDateFilter}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={toDateFilter}
              min={fromDate}
              onChange={(e) => setToDateFilter(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employee">Employee</Label>
            <Select
              id="employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Everyone</option>
              {employees.data.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="method">Method</Label>
            <Select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">Any</option>
              {FACE_RECOGNITION_ENABLED && <option value="face">Face</option>}
              <option value="manual">Location / tap</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Result</Label>
            <Select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any</option>
              <option value="verified">Verified</option>
              <option value="pending_review">In review</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-sm">
              <p className="text-destructive">{error}</p>
              <p className="mt-2 text-muted-foreground">
                If this mentions a missing index, run{' '}
                <code className="font-mono">
                  firebase deploy --only firestore:indexes
                </code>
                .
              </p>
            </div>
          ) : rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No records in this range.
            </p>
          ) : (
            <>
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                {rows.length} record{rows.length === 1 ? '' : 's'}
                {data.length !== rows.length && ` (of ${data.length})`}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="hidden sm:table-cell">Method</TableHead>
                    <TableHead>Result</TableHead>
                    {FACE_RECOGNITION_ENABLED && <TableHead className="hidden lg:table-cell">Match</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((record) => (
                    <TableRow
                      key={record.id}
                      onClick={() => setSelected(record)}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap">
                        <span className="tabular-nums">
                          {timeIn(tz, toDate(record.createdAt))}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {record.localDate}
                        </p>
                      </TableCell>
                      <TableCell className="font-medium">
                        {record.employeeName}
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap">
                          {record.type === 'check_in' ? 'In' : 'Out'}
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
                          <p className="mt-1 max-w-[18rem] text-xs text-muted-foreground">
                            {reasonLabel(record.rejectReason)}
                          </p>
                        )}
                      </TableCell>
                      {FACE_RECOGNITION_ENABLED && (<TableCell className="hidden lg:table-cell tabular-nums">
                        {similarityLabel(record.face?.similarity)}
                      </TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <AttendanceDetailDialog
        record={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

/**
 * Build the CSV client-side.
 *
 * Done in the browser rather than server-side because the manager already has
 * every row on screen — a server export would mean another privileged code path
 * for no benefit.
 */
function toCsv(rows: AttendanceRecord[], tz: string): string {
  const header = [
    'Date (local)',
    'Time (local)',
    'Timezone',
    'Employee',
    'Event',
    'Method',
    'Result',
    'Reject reason',
    'Late',
    'Minutes late',
    'Latitude',
    'Longitude',
    'Distance (m)',
    'Accuracy (m)',
    'Mock location',
    'Record id',
  ];

  const lines = rows.map((r) => {
    const at = toDate(r.createdAt);
    return [
      r.localDate,
      at ? dateTimeIn(tz, at).split(', ')[1] ?? '' : '',
      tz,
      r.employeeName,
      r.type === 'check_in' ? 'Check in' : 'Check out',
      r.method,
      r.status,
      r.status === 'rejected' ? reasonLabel(r.rejectReason) : '',
      r.late ? 'yes' : 'no',
      String(r.minutesLate ?? 0),
      r.gps ? String(r.gps.lat) : '',
      r.gps ? String(r.gps.lng) : '',
      r.gps ? String(r.gps.distance) : '',
      r.gps ? String(r.gps.accuracy) : '',
      r.gps ? (r.gps.isMock ? 'yes' : 'no') : '',
      r.id,
    ].map(csvCell);
  });

  return [header.map(csvCell).join(','), ...lines.map((l) => l.join(','))].join('\r\n');
}

/**
 * Quote every cell and double any internal quotes.
 *
 * Also prefixes a value that Excel would read as a formula with a single quote:
 * employee names are free text, and `=cmd|...` in a CSV is a real attack on
 * whoever opens the export.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function download(csv: string, filename: string) {
  // The BOM makes Excel open UTF-8 names correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
