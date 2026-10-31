import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { IMAGE_CALL_OPTS } from '../lib/callable';
import { EMPLOYEE_ONLY, assertRole } from '../lib/auth';
import {
  EMBEDDING_COPY_THRESHOLD,
  FACE_RATE_LIMIT_MAX,
  FACE_RATE_LIMIT_WINDOW_MS,
  PHOTO_MAX_AGE_MS,
} from '../config';
import { assertLocation, haversine, type GpsCoords } from '../lib/location';
import {
  REASON,
  failedPrecondition,
  invalidArgument,
  notFound,
  permissionDenied,
} from '../lib/errors';
import {
  attendanceRef,
  checkinPhotoPrefix,
  employeeRef,
  markerRef,
  photoHashRef,
} from '../lib/paths';
import { assertFresh, isPathUnder, readUploadedPhoto } from '../lib/storage';
import { cosineSimilarity, validateEmbedding } from '../lib/embedding';
import { decodeMarker, sha256Hex, type MarkerResult } from '../lib/marker';
import { decideStatus } from '../lib/decide';
import { computeLateness, getRestaurant, toLocalDate } from '../lib/time';
import type {
  AttendanceDoc,
  AttendanceFace,
  AttendanceGps,
  AttendanceType,
  EmployeeDoc,
  MarkerDoc,
  PresenceStatus,
} from '../lib/types';

const Device = z
  .object({
    platform: z.string().trim().max(32),
    appVersion: z.string().trim().max(32),
  })
  .optional();

/** GPS coordinates the phone captures at the moment of check-in. */
const GpsSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10_000),
    isMockLocation: z.boolean(),
    timestampMs: z.number().int(),
  })
  .optional();

const Base = {
  type: z.enum(['check_in', 'check_out']),
  clientRequestId: z.string().trim().min(8).max(128),
  device: Device,
  gpsCoords: GpsSchema,
};

const Input = z.discriminatedUnion('method', [
  z.object({ ...Base, method: z.literal('manual') }),
  z.object({
    ...Base,
    method: z.literal('face'),
    photoPath: z.string().trim().min(1).max(512),
    embedding: z.array(z.number()).min(16).max(1024),
    facesDetected: z.number().int().min(0).max(32),
    modelVersion: z.string().trim().min(1).max(64),
  }),
]);

type ParsedInput = z.infer<typeof Input>;

/** Throw the right reason code if this event cannot follow the current state. */
function assertPresenceAllows(presence: PresenceStatus, type: AttendanceType): void {
  if (type === 'check_in' && presence === 'in') {
    failedPrecondition('You are already checked in.', { code: REASON.ALREADY_CHECKED_IN });
  }
  if (type === 'check_out' && presence === 'out') {
    failedPrecondition('You are not checked in yet.', { code: REASON.NOT_CHECKED_IN });
  }
}

/**
 * The only way attendance is ever written (TECHNICAL_PLAN.md §7.4, §7.6).
 *
 * The client sends evidence, never conclusions: a photo path and an embedding,
 * but no similarity score and no status. Everything that decides the outcome —
 * the clock, the QR check, the cosine comparison, the presence state machine —
 * happens here.
 */
export const recordAttendance = onCall(IMAGE_CALL_OPTS, async (request) => {
  const caller = assertRole(request, EMPLOYEE_ONLY);
  const eid = caller.eid as string;

  const parsed = Input.safeParse(request.data);
  if (!parsed.success) {
    invalidArgument('That check-in could not be read. Try again.', parsed.error.flatten());
  }
  const input: ParsedInput = parsed.data;

  // One server clock for the whole call, so createdAt, localDate and the
  // lateness calculation can never disagree. This is the Cloud Functions
  // instance clock — Google's, not the phone's.
  const now = new Date();

  // --- 1. employee + restaurant state -------------------------------------
  const employeeDocRef = employeeRef(caller.rid, eid);
  const [employeeSnap, restaurant] = await Promise.all([
    employeeDocRef.get(),
    getRestaurant(caller.rid),
  ]);
  if (!employeeSnap.exists) notFound('Your employee record is missing. Ask your manager.');
  const employee = employeeSnap.data() as EmployeeDoc;

  if (!employee.active) {
    failedPrecondition('Your account is inactive. Ask your manager.', {
      code: REASON.EMPLOYEE_INACTIVE,
    });
  }

  // --- 2. is this method allowed here? ------------------------------------
  const mode = restaurant.settings.attendanceMode;
  if (mode !== 'both' && mode !== input.method) {
    failedPrecondition(
      input.method === 'face'
        ? 'Face check-in is turned off for this restaurant.'
        : 'Manual check-in is turned off for this restaurant. Use face check-in.',
      { code: REASON.METHOD_NOT_ALLOWED },
    );
  }

  // --- 3. idempotency ------------------------------------------------------
  // A flaky connection makes the app retry; the same clientRequestId must
  // return the original outcome instead of creating a second record.
  const existing = await attendanceRef(caller.rid)
    .where('employeeId', '==', eid)
    .where('clientRequestId', '==', input.clientRequestId)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data() as AttendanceDoc;
    return {
      recordId: doc.id,
      status: data.status,
      rejectReason: data.rejectReason ?? null,
      similarity: data.face?.similarity ?? null,
      late: data.late ?? false,
      minutesLate: data.minutesLate ?? 0,
      duplicate: true,
    };
  }

  // --- 4. rate limit (face only) ------------------------------------------
  if (input.method === 'face') {
    const cutoff = Timestamp.fromMillis(now.getTime() - FACE_RATE_LIMIT_WINDOW_MS);
    // Uses the (employeeId, createdAt) index; method is filtered in memory so
    // no extra composite index is needed.
    const recent = await attendanceRef(caller.rid)
      .where('employeeId', '==', eid)
      .where('createdAt', '>=', cutoff)
      .orderBy('createdAt', 'desc')
      .limit(FACE_RATE_LIMIT_MAX * 3)
      .get();
    const faceAttempts = recent.docs.filter(
      (d) => (d.data() as AttendanceDoc).method === 'face',
    ).length;
    if (faceAttempts >= FACE_RATE_LIMIT_MAX) {
      failedPrecondition('Too many tries. Wait a few minutes and check in again.', {
        code: REASON.RATE_LIMITED,
      });
    }
  }

  // Keep location failures as rejected records, using the same transaction as
  // normal attendance. Never advance presence for rejected GPS evidence.
  const rawGps = input.gpsCoords as GpsCoords | undefined;
  const gpsEvidence: AttendanceGps | undefined = rawGps ? {
    lat: rawGps.lat, lng: rawGps.lng, accuracy: rawGps.accuracy,
    distance: haversine(rawGps.lat, rawGps.lng, restaurant.settings.locationLat, restaurant.settings.locationLng),
    isMock: rawGps.isMockLocation,
  } : undefined;
  let locationReason: string | undefined;
  try {
    assertLocation(rawGps, restaurant.settings, now);
  } catch (error) {
    if (!(error instanceof HttpsError)) throw error;
    locationReason = (error.details as {code: string}).code;
  }

  // --- 5. presence state machine (re-checked inside the transaction) ------
  if (!locationReason) assertPresenceAllows(employee.presence?.status ?? 'out', input.type);

  // --- face-only evidence gathering ---------------------------------------
  let face: AttendanceFace | undefined;
  let photoHash: string | undefined;
  let markerResult: MarkerResult = { found: false, valid: false };
  let embeddingValid = false;
  let similarity: number | null = null;

  if (input.method === 'face' && !locationReason) {
    // 6. the photo must be ours, fresh, and a real JPEG.
    if (!isPathUnder(input.photoPath, checkinPhotoPrefix(caller.rid, eid))) {
      permissionDenied('That photo does not belong to your account.');
    }
    const photo = await readUploadedPhoto(input.photoPath);
    assertFresh(photo.uploadedAt, now, PHOTO_MAX_AGE_MS);

    // 7. no replaying a photo that already counted once.
    photoHash = sha256Hex(photo.bytes);
    const seen = await photoHashRef(caller.rid, photoHash).get();
    if (seen.exists) {
      failedPrecondition('That photo was already used. Take a new one.', {
        code: REASON.PHOTO_REUSED,
      });
    }

    // 8. marker: was the restaurant's own poster in frame?
    const markerSnap = await markerRef(caller.rid).get();
    if (markerSnap.exists) {
      const marker = markerSnap.data() as MarkerDoc;
      markerResult = await decodeMarker(photo.bytes, {
        rid: caller.rid,
        markerVersion: marker.markerVersion,
        markerSecret: marker.markerSecret,
      });
    }

    // 9. face: compare against the manager-approved enrolment embedding.
    const stored = employee.face?.embedding;
    if (employee.face?.status === 'approved' && Array.isArray(stored) && stored.length > 0) {
      const check = validateEmbedding(input.embedding, stored.length);
      if (check.ok) {
        const sim = cosineSimilarity(stored, input.embedding);
        if (sim > EMBEDDING_COPY_THRESHOLD) {
          // A fresh capture is never this close to the enrolment average. This
          // is the stored vector played back, not a new photo of a face.
          embeddingValid = false;
        } else {
          embeddingValid = true;
          similarity = sim;
        }
      }
    }

    face = {
      photoPath: input.photoPath,
      modelVersion: input.modelVersion,
      similarity,
      facesDetected: input.facesDetected,
      markerFound: markerResult.found,
      markerValid: markerResult.valid,
    };
  }

  // --- 10. the verdict -----------------------------------------------------
  const decision = locationReason
    ? { status: 'rejected' as const, rejectReason: locationReason }
    : decideStatus({
    method: input.method,
    requireMarker: restaurant.settings.requireMarker,
    markerFound: markerResult.found,
    markerValid: markerResult.valid,
    faceStatus: employee.face?.status ?? 'none',
    enrolledModelVersion: employee.face?.modelVersion,
    submittedModelVersion: input.method === 'face' ? input.modelVersion : undefined,
    embeddingValid,
    facesDetected: input.method === 'face' ? input.facesDetected : 1,
    similarity,
    verifyThreshold: restaurant.settings.faceVerifyThreshold,
    reviewThreshold: restaurant.settings.faceReviewThreshold,
  });

  // --- 11. commit ----------------------------------------------------------
  const timezone = restaurant.timezone || 'Asia/Karachi';
  const localDate = toLocalDate(now, timezone);
  const lateness =
    input.type === 'check_in'
      ? computeLateness(
        now,
        timezone,
        employee.scheduledStart,
        restaurant.settings.lateGraceMinutes,
      )
      : null;

  const recordRef = attendanceRef(caller.rid).doc(sha256Hex(Buffer.from(`${eid}:${input.clientRequestId}`)));
  let duplicate = false;
  let saved: AttendanceDoc | undefined;

  await recordRef.firestore.runTransaction(async (tx) => {
    // Re-read presence inside the transaction: two phones, or a double tap,
    // could have raced past the check in step 5.
    const existingRecord = await tx.get(recordRef);
    if (existingRecord.exists) {
      duplicate = true;
      saved = existingRecord.data() as AttendanceDoc;
      return;
    }
    const freshEmployee = await tx.get(employeeDocRef);
    const freshPresence = ((freshEmployee.data() as EmployeeDoc | undefined)?.presence
      ?.status ?? 'out') as PresenceStatus;
    if (!(freshEmployee.data() as EmployeeDoc | undefined)?.active) {
      failedPrecondition('Your account is inactive.', {code: REASON.EMPLOYEE_INACTIVE});
    }
    if (!locationReason) assertPresenceAllows(freshPresence, input.type);
    if (photoHash && (await tx.get(photoHashRef(caller.rid, photoHash))).exists) {
      failedPrecondition('That photo was already used.', {code: REASON.PHOTO_REUSED});
    }

    const record: AttendanceDoc = {
      employeeId: eid,
      employeeName: employee.name,
      type: input.type,
      method: input.method,
      status: decision.status,
      rejectReason: decision.rejectReason,
      createdAt: Timestamp.fromDate(now),
      localDate,
      late: lateness?.late,
      minutesLate: lateness?.minutesLate,
      face,
      gps: gpsEvidence,
      device: input.device,
      clientRequestId: input.clientRequestId,
    };
    saved = record;
    tx.create(recordRef, record);

    // The hash ledger is written even for rejected attempts, so a rejected
    // photo cannot simply be retried until it happens to pass.
    if (photoHash) {
      tx.set(photoHashRef(caller.rid, photoHash), {
        recordId: recordRef.id,
        createdAt: Timestamp.fromDate(now),
      });
    }

    // Rejected attempts are kept as an audit trail but never move presence.
    if (decision.status !== 'rejected') {
      tx.update(employeeDocRef, {
        'presence.status': input.type === 'check_in' ? 'in' : 'out',
        'presence.lastEventAt': Timestamp.fromDate(now),
        'presence.lastRecordId': recordRef.id,
      });
    }
  });

  return {
    recordId: recordRef.id,
    status: saved!.status,
    rejectReason: saved!.rejectReason ?? null,
    similarity: saved!.face?.similarity ?? null,
    late: saved!.late ?? false,
    minutesLate: saved!.minutesLate ?? 0,
    duplicate,
  };
});
