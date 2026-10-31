import type { Timestamp } from 'firebase/firestore';

/** Mirrors `firebase/functions/src/lib/types.ts`. Kept in sync by hand. */

export type Role = 'owner' | 'manager' | 'employee';
export type AttendanceMode = 'manual' | 'face' | 'both';
export type AttendanceType = 'check_in' | 'check_out';
export type AttendanceMethod = 'manual' | 'face';
export type AttendanceStatus = 'verified' | 'pending_review' | 'rejected';
export type FaceStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type PresenceStatus = 'in' | 'out';

export interface RestaurantSettings {
  attendanceMode: AttendanceMode;
  faceVerifyThreshold: number;
  faceReviewThreshold: number;
  requireMarker: boolean;
  lateGraceMinutes: number;
  requireLocation: boolean;
  locationLat: number;
  locationLng: number;
  locationRadiusMeters: number;
}

export interface Restaurant {
  id: string;
  name: string;
  timezone: string;
  ownerUid: string;
  settings: RestaurantSettings;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  uid: string;
  active: boolean;
  scheduledStart?: string;
  face: {
    status: FaceStatus;
    enrolPhotoPath?: string;
    modelVersion?: string;
    submittedAt?: Timestamp;
    reviewedBy?: string;
    reviewedAt?: Timestamp;
    reviewNote?: string;
  };
  presence: {
    status: PresenceStatus;
    lastEventAt?: Timestamp;
    lastRecordId?: string;
  };
  createdAt?: Timestamp;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  type: AttendanceType;
  method: AttendanceMethod;
  status: AttendanceStatus;
  rejectReason?: string;
  createdAt?: Timestamp;
  localDate: string;
  late?: boolean;
  minutesLate?: number;
  face?: {
    photoPath: string;
    modelVersion: string;
    similarity: number | null;
    facesDetected: number;
    markerFound: boolean;
    markerValid: boolean;
  };
  gps?: { lat: number; lng: number; accuracy: number; distance: number; isMock: boolean };
  review?: {
    by: string;
    at: Timestamp;
    decision: 'approve' | 'reject';
    note?: string | null;
  };
  device?: { platform: string; appVersion: string };
  clientRequestId: string;
}

export interface PortalUser {
  uid: string;
  role: Role;
  restaurantId: string;
  displayName: string;
  email: string;
}
