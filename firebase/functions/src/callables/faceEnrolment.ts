import { onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CALL_OPTS } from '../lib/callable';
import { EMPLOYEE_ONLY, STAFF, assertRole } from '../lib/auth';
import {
  REASON,
  failedPrecondition,
  invalidArgument,
  notFound,
  permissionDenied,
} from '../lib/errors';
import { employeeRef, enrolPhotoPrefix } from '../lib/paths';
import { isPathUnder } from '../lib/storage';
import { validateEmbedding } from '../lib/embedding';
import type { EmployeeDoc } from '../lib/types';

const SubmitInput = z.object({
  photoPath: z.string().trim().min(1).max(512),
  embedding: z.array(z.number()).min(16).max(1024),
  modelVersion: z.string().trim().min(1).max(64),
});

/**
 * An employee submits their averaged enrolment embedding for manager approval.
 *
 * Nothing here is trusted on the client's word: the photo path must sit under
 * this employee's own prefix, and the embedding must be the right shape and
 * roughly unit length. Approval is still a human step (see
 * `reviewFaceEnrolment`) because that is the anti-fraud anchor of the whole
 * design — nobody can enrol someone else's face.
 */
export const submitFaceEnrolment = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, EMPLOYEE_ONLY);
  const eid = caller.eid as string;

  const parsed = SubmitInput.safeParse(request.data);
  if (!parsed.success) {
    invalidArgument('That enrolment could not be read. Try again.', parsed.error.flatten());
  }
  const { photoPath, embedding, modelVersion } = parsed.data;

  if (!isPathUnder(photoPath, enrolPhotoPrefix(caller.rid, eid))) {
    permissionDenied('That photo does not belong to your account.');
  }

  const check = validateEmbedding(embedding);
  if (!check.ok) {
    failedPrecondition('The face data from your phone looks wrong. Retake the photos.', {
      code: REASON.EMBEDDING_INVALID,
      problem: check.problem,
    });
  }

  const ref = employeeRef(caller.rid, eid);
  const snap = await ref.get();
  if (!snap.exists) notFound('Your employee record is missing. Ask your manager.');
  const employee = snap.data() as EmployeeDoc;

  if (!employee.active) {
    failedPrecondition('Your account is inactive. Ask your manager.', {
      code: REASON.EMPLOYEE_INACTIVE,
    });
  }
  if (employee.face?.status === 'pending') {
    failedPrecondition('Your enrolment is already waiting for manager approval.');
  }
  if (employee.face?.status === 'approved') {
    failedPrecondition('Your face is already enrolled.');
  }

  await ref.update({
    'face.status': 'pending',
    'face.enrolPhotoPath': photoPath,
    'face.embedding': embedding,
    'face.modelVersion': modelVersion,
    'face.submittedAt': FieldValue.serverTimestamp(),
    'face.reviewedBy': FieldValue.delete(),
    'face.reviewedAt': FieldValue.delete(),
  });

  return { status: 'pending' as const };
});

const ReviewInput = z.object({
  employeeId: z.string().trim().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

/**
 * Owner or manager approves or rejects a pending enrolment after comparing the
 * photo with the real person.
 *
 * A rejection clears the stored embedding: keeping it would leave a vector
 * nobody vouched for sitting where a future bug could compare against it.
 * The photo path is kept so the rejection remains auditable.
 */
export const reviewFaceEnrolment = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, STAFF);

  const parsed = ReviewInput.safeParse(request.data);
  if (!parsed.success) invalidArgument('Which enrolment?', parsed.error.flatten());
  const { employeeId, decision, note } = parsed.data;

  const ref = employeeRef(caller.rid, employeeId);
  const snap = await ref.get();
  if (!snap.exists) notFound('Employee not found.');
  const employee = snap.data() as EmployeeDoc;

  if (employee.face?.status !== 'pending') {
    failedPrecondition('There is no enrolment waiting for review for this employee.');
  }

  const approved = decision === 'approve';
  await ref.update({
    'face.status': approved ? 'approved' : 'rejected',
    'face.reviewedBy': caller.uid,
    'face.reviewedAt': FieldValue.serverTimestamp(),
    'face.reviewNote': note ?? FieldValue.delete(),
    ...(approved
      ? {}
      : {
          'face.embedding': FieldValue.delete(),
          'face.modelVersion': FieldValue.delete(),
        }),
  });

  return { employeeId, status: approved ? ('approved' as const) : ('rejected' as const) };
});
