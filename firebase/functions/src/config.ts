/**
 * Deployment-wide constants. Keep these in one place so the emulator, the
 * mobile app and the portal agree on region and limits.
 */

/** Cloud Functions region (closest to Pakistan — see TECHNICAL_PLAN.md §3). */
export const REGION = 'asia-south1';

/** Default restaurant settings applied by `createRestaurant`. */
export const DEFAULT_SETTINGS = {
  attendanceMode: 'both' as const,
  /** Cosine similarity at or above which a face check-in is auto-verified. */
  faceVerifyThreshold: 0.75,
  /** At or above this (but below verify) the record goes to manager review. */
  faceReviewThreshold: 0.6,
  requireMarker: true,
  lateGraceMinutes: 10,
};

/** Expected dimensionality of a face embedding, by model version. */
export const SUPPORTED_EMBEDDING_LENGTHS = [128, 192, 512];

/** An embedding must be unit length to within this tolerance. */
export const EMBEDDING_NORM_TOLERANCE = 0.02;

/**
 * A submitted check-in embedding that is this similar to the stored enrolment
 * embedding was copied rather than computed from a fresh photo.
 */
export const EMBEDDING_COPY_THRESHOLD = 0.999;

/** A check-in photo must have been uploaded within this window. */
export const PHOTO_MAX_AGE_MS = 3 * 60 * 1000;

/** Face check-in rate limit: at most N attempts per window, per employee. */
export const FACE_RATE_LIMIT_MAX = 5;
export const FACE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Uploaded photos larger than this are refused server-side too. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/** Marker QR payload prefix. */
export const MARKER_PREFIX = 'ATTN1';

/** Temporary password length for generated employee accounts. */
export const TEMP_PASSWORD_LENGTH = 10;
