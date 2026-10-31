'use client';

import * as React from 'react';
import { ImageOff, ShieldCheck } from 'lucide-react';

import { FaceStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useTimezone } from '@/lib/auth-context';
import { reviewFaceEnrolment } from '@/lib/callables';
import { dateTimeIn, toDate } from '@/lib/format';
import { useStorageUrl } from '@/lib/hooks';
import { callableErrorMessage } from '@/lib/reason-codes';
import type { Employee } from '@/lib/types';

/**
 * Approve or reject a face enrolment.
 *
 * This is the anti-fraud anchor of the whole system: the embedding the server
 * will compare every future check-in against is only trusted because a human
 * stood in front of this person and confirmed the photo is them. The wording is
 * deliberately blunt about that.
 */
export function EnrolmentReviewCard({ employee }: { employee: Employee }) {
  const tz = useTimezone();
  const toast = useToast();
  const photoUrl = useStorageUrl(employee.face?.enrolPhotoPath);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null);

  const status = employee.face?.status ?? 'none';
  const submittedAt = toDate(employee.face?.submittedAt);
  const reviewedAt = toDate(employee.face?.reviewedAt);

  async function review(decision: 'approve' | 'reject') {
    setBusy(decision);
    try {
      await reviewFaceEnrolment({
        employeeId: employee.id,
        decision,
        note: note.trim() || undefined,
      });
      toast.success(
        decision === 'approve' ? 'Enrolment approved' : 'Enrolment rejected',
        decision === 'approve'
          ? `${employee.name} can now check in with their face.`
          : `${employee.name} will be asked to enrol again.`,
      );
      setNote('');
    } catch (err) {
      toast.error('Could not save that decision', callableErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={status === 'pending' ? 'border-warning/40' : undefined}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Face enrolment</CardTitle>
        <FaceStatusBadge status={status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === 'none' ? (
          <p className="text-sm text-muted-foreground">
            {employee.name.split(' ')[0]} has not enrolled yet. They are prompted
            to on their next sign-in to the mobile app.
          </p>
        ) : (
          <>
            <div className="flex gap-4">
              <EnrolmentPhoto url={photoUrl} />
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                {submittedAt && (
                  <p>
                    <span className="text-muted-foreground">Submitted</span>{' '}
                    {dateTimeIn(tz, submittedAt)}
                  </p>
                )}
                {reviewedAt && (
                  <p>
                    <span className="text-muted-foreground">Reviewed</span>{' '}
                    {dateTimeIn(tz, reviewedAt)}
                  </p>
                )}
                {employee.face?.modelVersion && (
                  <p className="truncate">
                    <span className="text-muted-foreground">Model</span>{' '}
                    <code className="font-mono text-xs">
                      {employee.face.modelVersion}
                    </code>
                  </p>
                )}
                {employee.face?.reviewNote && (
                  <p className="text-muted-foreground">
                    “{employee.face.reviewNote}”
                  </p>
                )}
              </div>
            </div>

            {status === 'pending' && (
              <>
                <div className="flex gap-2 rounded-md bg-warning/10 p-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    Compare this photo with {employee.name} in person before
                    approving. Approving the wrong face lets someone else check in
                    as them for good.
                  </span>
                </div>
                <Input
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => review('approve')}
                    disabled={busy !== null}
                  >
                    {busy === 'approve' ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => review('reject')}
                    disabled={busy !== null}
                  >
                    {busy === 'reject' ? 'Rejecting...' : 'Reject'}
                  </Button>
                </div>
              </>
            )}

            {status === 'rejected' && (
              <p className="text-sm text-muted-foreground">
                The stored face data was cleared. {employee.name.split(' ')[0]} is
                prompted to enrol again in the app.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function EnrolmentPhoto({
  url,
  className = 'h-32 w-24',
}: {
  url: string | null;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-md border bg-muted text-muted-foreground ${className}`}
      >
        <ImageOff className="h-5 w-5" />
        <span className="text-[10px]">No photo</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Face enrolment photo"
      className={`shrink-0 rounded-md border object-cover ${className}`}
    />
  );
}
