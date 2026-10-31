import { HttpsError } from 'firebase-functions/v2/https';
export const REASON = {
  MARKER_NOT_FOUND: 'MARKER_NOT_FOUND',
  MARKER_INVALID: 'MARKER_INVALID',
  FACE_NOT_ENROLLED: 'FACE_NOT_ENROLLED',
  FACE_MODEL_MISMATCH: 'FACE_MODEL_MISMATCH',
  NO_FACE: 'NO_FACE',
  MULTIPLE_FACES: 'MULTIPLE_FACES',
  FACE_MISMATCH: 'FACE_MISMATCH',
  EMBEDDING_INVALID: 'EMBEDDING_INVALID',
  PHOTO_STALE: 'PHOTO_STALE',
  PHOTO_REUSED: 'PHOTO_REUSED',
  RATE_LIMITED: 'RATE_LIMITED',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
  NOT_CHECKED_IN: 'NOT_CHECKED_IN',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  EMPLOYEE_INACTIVE: 'EMPLOYEE_INACTIVE',
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  LOCATION_OUT_OF_RANGE: 'LOCATION_OUT_OF_RANGE',
  LOCATION_MOCK: 'LOCATION_MOCK',
  LOCATION_ACCURACY_LOW: 'LOCATION_ACCURACY_LOW',
  LOCATION_STALE: 'LOCATION_STALE',
} as const;
export function failedPrecondition(message = 'Authentication required.', details?: unknown): never { throw new HttpsError('failed-precondition', message, details); }
export function invalidArgument(message = 'Authentication required.', details?: unknown): never { throw new HttpsError('invalid-argument', message, details); }
export function notFound(message = 'Authentication required.', details?: unknown): never { throw new HttpsError('not-found', message, details); }
export function permissionDenied(message = 'Authentication required.', details?: unknown): never { throw new HttpsError('permission-denied', message, details); }
export function internal(message = 'Authentication required.', details?: unknown): never { throw new HttpsError('internal', message, details); }
export function unauthenticated(message = 'Authentication required.', details?: unknown): never { throw new HttpsError('unauthenticated', message, details); }
