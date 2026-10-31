/**
 * Reject reason codes, mirroring `firebase/functions/src/lib/errors.ts` and
 * `apps/mobile/lib/models/reason_codes.dart`.
 *
 * The portal wording is written for a manager looking at an audit trail, not
 * for the employee who hit the problem — "the poster was not visible in the
 * photo" rather than "stand in front of the poster".
 */
export const REASON_LABELS: Record<string, string> = {
  LOCATION_REQUIRED: 'GPS location was not supplied',
  LOCATION_MOCK: 'Mock GPS location detected — possible fraud attempt',
  LOCATION_OUT_OF_RANGE: 'Outside the restaurant area',
  LOCATION_ACCURACY_LOW: 'GPS accuracy was too low',
  LOCATION_STALE: 'GPS location was stale or dated in the future',
  MARKER_NOT_FOUND: 'Check-in poster not visible in the photo',
  MARKER_INVALID: 'Wrong or expired poster',
  FACE_NOT_ENROLLED: 'Face not enrolled or not approved',
  FACE_MODEL_MISMATCH: 'Enrolled with a different app version',
  NO_FACE: 'No face detected',
  MULTIPLE_FACES: 'More than one face in the photo',
  FACE_MISMATCH: 'Face did not match the enrolment',
  EMBEDDING_INVALID: 'Face data from the phone was invalid',
  PHOTO_STALE: 'Photo was too old when submitted',
  PHOTO_REUSED: 'Photo had already been used',
  RATE_LIMITED: 'Too many attempts',
  ALREADY_CHECKED_IN: 'Already checked in',
  NOT_CHECKED_IN: 'Was not checked in',
  METHOD_NOT_ALLOWED: 'Method not allowed for this restaurant',
  EMPLOYEE_INACTIVE: 'Employee is inactive',
};

export function reasonLabel(code: string | null | undefined): string {
  if (!code) return 'Rejected by a manager';
  return REASON_LABELS[code] ?? code;
}

/**
 * Codes that mean someone may have been trying it on, as opposed to a bad
 * photo. Surfaced in the review queue so a manager can tell the two apart.
 */
const SUSPICIOUS = new Set([
  'LOCATION_MOCK',
  'MARKER_INVALID',
  'PHOTO_REUSED',
  'PHOTO_STALE',
  'EMBEDDING_INVALID',
  'MULTIPLE_FACES',
]);

export function isSuspicious(code: string | null | undefined): boolean {
  return code ? SUSPICIOUS.has(code) : false;
}

/** Turn a callable failure into something a manager can act on. */
export function callableErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string; details?: unknown };
  const details = err?.details as { code?: string } | undefined;
  if (details?.code && REASON_LABELS[details.code]) {
    return REASON_LABELS[details.code];
  }
  switch (err?.code) {
    case 'functions/permission-denied':
      return 'You are not allowed to do that.';
    case 'functions/unauthenticated':
      return 'Your session expired. Sign in again.';
    case 'functions/already-exists':
      return err.message ?? 'That already exists.';
    case 'functions/failed-precondition':
    case 'functions/invalid-argument':
      return err.message ?? 'That request was not valid.';
    case 'functions/unavailable':
    case 'functions/internal':
      return 'The server could not be reached. Try again.';
    default:
      return err?.message ?? 'Something went wrong. Try again.';
  }
}
