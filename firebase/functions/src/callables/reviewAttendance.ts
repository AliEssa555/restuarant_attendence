import { onCall } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CALL_OPTS } from '../lib/callable';
import { STAFF, assertRole } from '../lib/auth';
import { failedPrecondition, invalidArgument, notFound } from '../lib/errors';
import { attendanceDocRef, attendanceRef, employeeRef } from '../lib/paths';
import type { AttendanceDoc, EmployeeDoc } from '../lib/types';

const Input = z.object({
  recordId: z.string().trim().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

/**
 * Owner or manager resolves a `pending_review` attendance record.
 *
 * A pending record already moved presence when it was created, so approving it
 * only changes the status. Rejecting it has to undo that — but only if nothing
 * has happened since, which `presence.lastRecordId` tells us exactly. When it
 * does undo, presence is rebuilt from the previous surviving record rather than
 * blindly flipped, so a rejected check-out leaves the employee in the state the
 * record before it put them in.
 */
export const reviewAttendance = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, STAFF);

  const parsed = Input.safeParse(request.data);
  if (!parsed.success) invalidArgument('Which record?', parsed.error.flatten());
  const { recordId, decision, note } = parsed.data;

  const recordRef = attendanceDocRef(caller.rid, recordId);
  const approved = decision === 'approve';

  const result = await recordRef.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(recordRef);
    if (!snap.exists) notFound('Attendance record not found.');
    const record = snap.data() as AttendanceDoc;

    if (record.status !== 'pending_review') {
      failedPrecondition('That record has already been reviewed.');
    }

    const employeeDocRef = employeeRef(caller.rid, record.employeeId);
    const employeeSnap = await tx.get(employeeDocRef);
    const employee = employeeSnap.data() as EmployeeDoc | undefined;

    // Only revert if this record is still the one presence is standing on.
    const mustRevert =
      !approved && employee?.presence?.lastRecordId === recordId;

    let revertedTo: 'in' | 'out' | null = null;

    if (mustRevert) {
      // Rebuild presence from the newest surviving record before this one.
      const earlier = await tx.get(
        attendanceRef(caller.rid)
          .where('employeeId', '==', record.employeeId)
          .where('createdAt', '<', record.createdAt)
          .orderBy('createdAt', 'desc')
          .limit(10),
      );
      const previous = earlier.docs.find((d) => {
        const data = d.data() as AttendanceDoc;
        return data.status !== 'rejected';
      });

      if (previous) {
        const prev = previous.data() as AttendanceDoc;
        revertedTo = prev.type === 'check_in' ? 'in' : 'out';
        tx.update(employeeDocRef, {
          'presence.status': revertedTo,
          'presence.lastEventAt': prev.createdAt,
          'presence.lastRecordId': previous.id,
        });
      } else {
        revertedTo = 'out';
        tx.update(employeeDocRef, {
          'presence.status': 'out',
          'presence.lastEventAt': FieldValue.delete(),
          'presence.lastRecordId': FieldValue.delete(),
        });
      }
    }

    tx.update(recordRef, {
      status: approved ? 'verified' : 'rejected',
      review: {
        by: caller.uid,
        at: Timestamp.now(),
        decision,
        note: note ?? null,
      },
    });

    return { revertedTo };
  });

  return {
    recordId,
    status: approved ? ('verified' as const) : ('rejected' as const),
    presenceRevertedTo: result.revertedTo,
  };
});
