'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MapPinOff,
  QrCode,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { EnrolmentPhoto } from '@/components/enrolment-review-card';
import { MethodBadge, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useTimezone } from '@/lib/auth-context';
import { reviewAttendance } from '@/lib/callables';
import { dateTimeIn, lateLabel, similarityLabel, toDate } from '@/lib/format';
import { useEmployee, useStorageUrl } from '@/lib/hooks';
import { callableErrorMessage, isSuspicious, reasonLabel } from '@/lib/reason-codes';
import type { AttendanceRecord } from '@/lib/types';

/**
 * The evidence behind one attendance record, plus the review actions.
 *
 * Shown as a dialog rather than a true side panel so the same component works
 * on a manager's phone, which is where most reviewing actually happens.
 */
export function AttendanceDetailDialog({
  record,
  onClose,
}: {
  record: AttendanceRecord | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        {record && <DetailBody record={record} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({
  record,
  onDone,
}: {
  record: AttendanceRecord;
  onDone: () => void;
}) {
  const tz = useTimezone();
  const toast = useToast();
  const checkinUrl = useStorageUrl(record.face?.photoPath);
  const { data: employee } = useEmployee(record.employeeId);
  const enrolUrl = useStorageUrl(employee?.face?.enrolPhotoPath);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null);

  const at = toDate(record.createdAt);

  async function review(decision: 'approve' | 'reject') {
    setBusy(decision);
    try {
      const result = await reviewAttendance({
        recordId: record.id,
        decision,
        note: note.trim() || undefined,
      });
      toast.success(
        decision === 'approve' ? 'Approved' : 'Rejected',
        result.presenceRevertedTo
          ? `${record.employeeName} is now marked as ${
              result.presenceRevertedTo === 'in' ? 'checked in' : 'checked out'
            }.`
          : undefined,
      );
      onDone();
    } catch (err) {
      toast.error('Could not save that decision', callableErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{record.employeeName}</DialogTitle>
        <DialogDescription>
          {record.type === 'check_in' ? 'Check in' : 'Check out'} ·{' '}
          {dateTimeIn(tz, at)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={record.status} />
        <MethodBadge method={record.method} />
        {record.late && (
          <span className="text-xs font-medium text-warning">
            {lateLabel(record.minutesLate)}
          </span>
        )}
      </div>

      {record.method === 'manual' ? (
        <div className="flex gap-2 rounded-md bg-muted p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            Manual check-in. There is no photo and no location proof — the
            employee tapped a button. Low trust by design.
          </span>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Check-in photo
              </p>
              <EnrolmentPhoto url={checkinUrl} className="h-56 w-full" />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Approved enrolment
              </p>
              <EnrolmentPhoto url={enrolUrl} className="h-56 w-full" />
            </div>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Evidence
              label="Face match"
              value={similarityLabel(record.face?.similarity)}
              tone={
                record.face?.similarity == null
                  ? 'bad'
                  : record.status === 'verified'
                    ? 'good'
                    : 'warn'
              }
            />
            <Evidence
              label="Faces in photo"
              value={String(record.face?.facesDetected ?? 0)}
              tone={record.face?.facesDetected === 1 ? 'good' : 'bad'}
            />
            <Evidence
              label="Poster found"
              value={record.face?.markerFound ? 'Yes' : 'No'}
              tone={record.face?.markerFound ? 'good' : 'bad'}
              icon={record.face?.markerFound ? QrCode : MapPinOff}
            />
            <Evidence
              label="Poster valid"
              value={record.face?.markerValid ? 'Yes' : 'No'}
              tone={record.face?.markerValid ? 'good' : 'bad'}
            />
          </dl>
        </>
      )}

      {record.status === 'rejected' && (
        <div
          className={
            isSuspicious(record.rejectReason)
              ? 'flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'
              : 'flex gap-2 rounded-md bg-muted p-3 text-sm'
          }
        >
          {isSuspicious(record.rejectReason) ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium">{reasonLabel(record.rejectReason)}</p>
            <p className="mt-0.5 text-muted-foreground">
              {isSuspicious(record.rejectReason)
                ? 'Worth a look — this pattern suggests someone working around the check, not just a bad photo.'
                : 'This attempt did not change their in/out status.'}
            </p>
          </div>
        </div>
      )}

      {record.review && (
        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">
            {record.review.decision === 'approve' ? 'Approved' : 'Rejected'} by a
            manager
          </p>
          <p className="text-muted-foreground">
            {dateTimeIn(tz, toDate(record.review.at))}
            {record.review.note ? ` — “${record.review.note}”` : ''}
          </p>
        </div>
      )}

      {record.status === 'pending_review' && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            The score fell between the review and verify thresholds. Their time is
            already recorded; rejecting this will undo it if nothing has happened
            since.
          </p>
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => review('approve')} disabled={busy !== null}>
              <CheckCircle2 className="h-4 w-4" />
              {busy === 'approve' ? 'Approving...' : 'Approve'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => review('reject')}
              disabled={busy !== null}
            >
              <XCircle className="h-4 w-4" />
              {busy === 'reject' ? 'Rejecting...' : 'Reject'}
            </Button>
          </div>
        </div>
      )}

      <details className="border-t pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Technical details</summary>
        <dl className="mt-2 flex flex-col gap-1">
          <TechRow label="Record id" value={record.id} />
          <TechRow label="Request id" value={record.clientRequestId} />
          <TechRow label="Local date" value={record.localDate} />
          {record.face?.modelVersion && (
            <TechRow label="Model" value={record.face.modelVersion} />
          )}
          {record.face?.photoPath && (
            <TechRow label="Photo" value={record.face.photoPath} />
          )}
          {record.device && (
            <TechRow
              label="Device"
              value={`${record.device.platform} · app ${record.device.appVersion}`}
            />
          )}
        </dl>
      </details>
    </>
  );
}

function Evidence({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const colour =
    tone === 'good'
      ? 'text-success'
      : tone === 'warn'
        ? 'text-warning'
        : 'text-destructive';
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`flex items-center gap-1.5 font-medium tabular-nums ${colour}`}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {value}
      </dd>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0">{label}:</dt>
      <dd className="min-w-0 break-all font-mono">{value}</dd>
    </div>
  );
}
