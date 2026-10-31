import { REASON } from './errors';
import type { AttendanceMethod, AttendanceStatus, FaceStatus } from './types';
interface Evidence {
  method: AttendanceMethod; requireMarker: boolean; markerFound: boolean; markerValid: boolean;
  faceStatus: FaceStatus; enrolledModelVersion?: string; submittedModelVersion?: string;
  embeddingValid: boolean; facesDetected: number; similarity: number | null;
  verifyThreshold: number; reviewThreshold: number;
}
export function decideStatus(e: Evidence): {status: AttendanceStatus; rejectReason?: string} {
  const reject = (rejectReason: string) => ({ status: 'rejected' as const, rejectReason });
  if (e.method === 'manual') return { status: 'verified' };
  if (e.requireMarker && !e.markerFound) return reject(REASON.MARKER_NOT_FOUND);
  if (e.requireMarker && !e.markerValid) return reject(REASON.MARKER_INVALID);
  if (e.faceStatus !== 'approved') return reject(REASON.FACE_NOT_ENROLLED);
  if (e.enrolledModelVersion !== e.submittedModelVersion) return reject(REASON.FACE_MODEL_MISMATCH);
  if (e.facesDetected === 0) return reject(REASON.NO_FACE);
  if (e.facesDetected !== 1) return reject(REASON.MULTIPLE_FACES);
  if (!e.embeddingValid || e.similarity === null) return reject(REASON.EMBEDDING_INVALID);
  if (e.similarity >= e.verifyThreshold) return {status: 'verified'};
  if (e.similarity >= e.reviewThreshold) return {status: 'pending_review'};
  return reject(REASON.FACE_MISMATCH);
}
