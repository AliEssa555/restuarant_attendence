import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions } from './firebase';
import type { AttendanceMode } from './types';

/**
 * Typed wrappers for the Cloud Functions callables.
 *
 * Every privileged write in the portal goes through one of these — there are no
 * direct Firestore writes except the two the security rules whitelist
 * (restaurant settings and employee profile fields).
 */
function call<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => {
    const fn = httpsCallable<Req, Res>(firebaseFunctions(), name);
    const result = await fn(data);
    return result.data;
  };
}

export const createRestaurant = call<
  { name: string; timezone: string; displayName?: string },
  { restaurantId: string; role: 'owner' }
>('createRestaurant');

export const createEmployee = call<
  {
    name: string;
    email: string;
    phone?: string;
    position?: string;
    scheduledStart?: string;
  },
  { employeeId: string; uid: string; email: string; tempPassword: string }
>('createEmployee');

export const createStaff = call<
  { name: string; email: string; role?: 'manager' },
  { uid: string; email: string; tempPassword: string }
>('createStaff');

export const setEmployeeActive = call<
  { employeeId: string; active: boolean },
  { employeeId: string; active: boolean }
>('setEmployeeActive');

export const reviewFaceEnrolment = call<
  { employeeId: string; decision: 'approve' | 'reject'; note?: string },
  { employeeId: string; status: 'approved' | 'rejected' }
>('reviewFaceEnrolment');

export const reviewAttendance = call<
  { recordId: string; decision: 'approve' | 'reject'; note?: string },
  {
    recordId: string;
    status: 'verified' | 'rejected';
    presenceRevertedTo: 'in' | 'out' | null;
  }
>('reviewAttendance');

export const getMarkerPayload = call<
  Record<string, never>,
  {
    payload: string;
    markerVersion: number;
    rotatedAt: number | null;
    restaurantName: string;
    timezone: string;
  }
>('getMarkerPayload');

export const rotateMarker = call<
  Record<string, never>,
  { payload: string; markerVersion: number }
>('rotateMarker');

/** Settings are written straight to Firestore; the rules validate the shape. */
export interface SettingsUpdate {
  attendanceMode: AttendanceMode;
  faceVerifyThreshold: number;
  faceReviewThreshold: number;
  requireMarker: boolean;
  lateGraceMinutes: number;
}
