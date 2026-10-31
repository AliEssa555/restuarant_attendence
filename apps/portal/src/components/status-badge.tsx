import { CheckCircle2, Clock, Hand, Scan, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { AttendanceMethod, AttendanceStatus, FaceStatus } from '@/lib/types';

/** Verified / In review / Rejected — same wording as the employee app. */
export function StatusBadge({ status }: { status: AttendanceStatus }) {
  if (status === 'verified') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        Verified
      </Badge>
    );
  }
  if (status === 'pending_review') {
    return (
      <Badge variant="warning">
        <Clock className="h-3 w-3" />
        In review
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <XCircle className="h-3 w-3" />
      Rejected
    </Badge>
  );
}

/**
 * How the check-in was made. Manual is labelled plainly rather than hidden:
 * a manager reading the log should be able to see at a glance which rows carry
 * evidence and which are self-reported.
 */
export function MethodBadge({ method }: { method: AttendanceMethod }) {
  return method === 'face' ? (
    <Badge variant="default">
      <Scan className="h-3 w-3" />
      Face
    </Badge>
  ) : (
    <Badge variant="secondary">
      <Hand className="h-3 w-3" />
      Manual
    </Badge>
  );
}

export function FaceStatusBadge({ status }: { status: FaceStatus }) {
  switch (status) {
    case 'approved':
      return <Badge variant="success">Approved</Badge>;
    case 'pending':
      return <Badge variant="warning">Awaiting review</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="outline">Not enrolled</Badge>;
  }
}

export function PresenceBadge({ status }: { status: 'in' | 'out' }) {
  return status === 'in' ? (
    <Badge variant="success">In</Badge>
  ) : (
    <Badge variant="secondary">Out</Badge>
  );
}
