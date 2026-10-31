import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const here = dirname(fileURLToPath(import.meta.url));
const firebaseDir = join(here, '..');

export const PROJECT_ID = 'restaurant-attendance-demo';

export const RID = 'rest_1';
export const OTHER_RID = 'rest_2';
export const EID = 'emp_1';
export const OTHER_EID = 'emp_2';

export const OWNER_UID = 'uid_owner';
export const MANAGER_UID = 'uid_manager';
export const EMPLOYEE_UID = 'uid_employee';
export const OTHER_EMPLOYEE_UID = 'uid_employee_2';
export const OUTSIDER_UID = 'uid_outsider';

/** Custom claims exactly as the callables set them. */
export const claims = {
  owner: { role: 'owner', rid: RID },
  manager: { role: 'manager', rid: RID },
  employee: { role: 'employee', rid: RID, eid: EID },
  otherEmployee: { role: 'employee', rid: RID, eid: OTHER_EID },
  otherRestaurantOwner: { role: 'owner', rid: OTHER_RID },
  /** Signed in but never attached to a restaurant — a fresh owner signup. */
  unattached: {},
} as const;

export async function makeTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(firebaseDir, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(join(firebaseDir, 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
}

/**
 * Seed the documents the rules are tested against, bypassing the rules the way
 * Cloud Functions does with the Admin SDK.
 */
export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await db.doc(`users/${OWNER_UID}`).set({
      role: 'owner',
      restaurantId: RID,
      displayName: 'Owner',
      email: 'owner@demo.test',
      mustChangePassword: false,
    });
    await db.doc(`users/${MANAGER_UID}`).set({
      role: 'manager',
      restaurantId: RID,
      displayName: 'Manager',
      email: 'manager@demo.test',
      mustChangePassword: true,
    });
    await db.doc(`users/${EMPLOYEE_UID}`).set({
      role: 'employee',
      restaurantId: RID,
      employeeId: EID,
      displayName: 'Employee One',
      email: 'one@demo.test',
      mustChangePassword: true,
    });
    await db.doc(`users/${OTHER_EMPLOYEE_UID}`).set({
      role: 'employee',
      restaurantId: RID,
      employeeId: OTHER_EID,
      displayName: 'Employee Two',
      email: 'two@demo.test',
      mustChangePassword: false,
    });
    await db.doc(`users/${OUTSIDER_UID}`).set({
      role: 'owner',
      restaurantId: OTHER_RID,
      displayName: 'Other Owner',
      email: 'other@demo.test',
      mustChangePassword: false,
    });

    await db.doc(`restaurants/${RID}`).set({
      name: 'Karachi Grill',
      timezone: 'Asia/Karachi',
      ownerUid: OWNER_UID,
      settings: {
        attendanceMode: 'both',
        faceVerifyThreshold: 0.75,
        faceReviewThreshold: 0.6,
        requireMarker: true,
        lateGraceMinutes: 10,
      },
    });
    await db.doc(`restaurants/${RID}/private/checkin`).set({
      markerSecret: 'super-secret',
      markerVersion: 1,
    });

    for (const [eid, uid, name] of [
      [EID, EMPLOYEE_UID, 'Employee One'],
      [OTHER_EID, OTHER_EMPLOYEE_UID, 'Employee Two'],
    ] as const) {
      await db.doc(`restaurants/${RID}/employees/${eid}`).set({
        name,
        email: `${eid}@demo.test`,
        uid,
        active: true,
        position: 'Waiter',
        scheduledStart: '09:00',
        face: { status: 'approved', embedding: [0.1, 0.2], modelVersion: 'v1' },
        presence: { status: 'out' },
      });
    }

    await db.doc(`restaurants/${RID}/attendance/rec_mine`).set({
      employeeId: EID,
      employeeName: 'Employee One',
      type: 'check_in',
      method: 'face',
      status: 'verified',
      localDate: '2026-03-14',
      clientRequestId: 'req_1',
    });
    await db.doc(`restaurants/${RID}/attendance/rec_theirs`).set({
      employeeId: OTHER_EID,
      employeeName: 'Employee Two',
      type: 'check_in',
      method: 'manual',
      status: 'verified',
      localDate: '2026-03-14',
      clientRequestId: 'req_2',
    });

    await db.doc(`restaurants/${RID}/photoHashes/abc123`).set({
      recordId: 'rec_mine',
    });
  });
}

/** A 1x1 JPEG, for the Storage rules tests. */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EAKsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/9k=',
  'base64',
);
