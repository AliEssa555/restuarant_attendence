import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';

import {
  EID,
  EMPLOYEE_UID,
  MANAGER_UID,
  OTHER_EID,
  OTHER_EMPLOYEE_UID,
  OUTSIDER_UID,
  OWNER_UID,
  RID,
  claims,
  makeTestEnv,
  seed,
} from './helpers';

/**
 * Firestore security rules (TECHNICAL_PLAN.md §9).
 *
 * The rules are the real access control for everything the clients touch
 * directly, so each bullet of §9 gets both a positive and a negative case —
 * a rule that allows the right thing but also allows everything else would pass
 * a one-sided test.
 */
let env: RulesTestEnvironment;

const asOwner = () => env.authenticatedContext(OWNER_UID, claims.owner).firestore();
const asManager = () =>
  env.authenticatedContext(MANAGER_UID, claims.manager).firestore();
const asEmployee = () =>
  env.authenticatedContext(EMPLOYEE_UID, claims.employee).firestore();
const asOtherEmployee = () =>
  env.authenticatedContext(OTHER_EMPLOYEE_UID, claims.otherEmployee).firestore();
const asOutsider = () =>
  env.authenticatedContext(OUTSIDER_UID, claims.otherRestaurantOwner).firestore();
const asAnonymous = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await makeTestEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
});

describe('users', () => {
  it('lets you read your own user document', async () => {
    await assertSucceeds(getDoc(doc(asEmployee(), `users/${EMPLOYEE_UID}`)));
  });

  it('lets staff read a user of their own restaurant', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), `users/${EMPLOYEE_UID}`)));
    await assertSucceeds(getDoc(doc(asManager(), `users/${EMPLOYEE_UID}`)));
  });

  it('stops an employee reading a colleague', async () => {
    await assertFails(getDoc(doc(asEmployee(), `users/${OTHER_EMPLOYEE_UID}`)));
  });

  it('stops staff of another restaurant reading our users', async () => {
    await assertFails(getDoc(doc(asOutsider(), `users/${EMPLOYEE_UID}`)));
  });

  it('stops an anonymous read', async () => {
    await assertFails(getDoc(doc(asAnonymous(), `users/${EMPLOYEE_UID}`)));
  });

  it('allows clearing your own mustChangePassword flag', async () => {
    await assertSucceeds(
      updateDoc(doc(asEmployee(), `users/${EMPLOYEE_UID}`), {
        mustChangePassword: false,
      }),
    );
  });

  it('refuses setting mustChangePassword back to true', async () => {
    await assertFails(
      updateDoc(doc(asEmployee(), `users/${EMPLOYEE_UID}`), {
        mustChangePassword: true,
      }),
    );
  });

  it('refuses smuggling a role change alongside the flag', async () => {
    await assertFails(
      updateDoc(doc(asEmployee(), `users/${EMPLOYEE_UID}`), {
        mustChangePassword: false,
        role: 'owner',
      }),
    );
  });

  it('refuses clearing the flag on someone else', async () => {
    await assertFails(
      updateDoc(doc(asEmployee(), `users/${MANAGER_UID}`), {
        mustChangePassword: false,
      }),
    );
  });

  it('refuses creating or deleting a user document', async () => {
    await assertFails(setDoc(doc(asOwner(), 'users/uid_new'), { role: 'owner' }));
    await assertFails(deleteDoc(doc(asOwner(), `users/${EMPLOYEE_UID}`)));
  });
});

describe('restaurants', () => {
  it('lets any member read the restaurant', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), `restaurants/${RID}`)));
    await assertSucceeds(getDoc(doc(asManager(), `restaurants/${RID}`)));
    await assertSucceeds(getDoc(doc(asEmployee(), `restaurants/${RID}`)));
  });

  it('stops another restaurant reading it', async () => {
    await assertFails(getDoc(doc(asOutsider(), `restaurants/${RID}`)));
  });

  it('lets the owner rename it', async () => {
    await assertSucceeds(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), { name: 'New Name' }),
    );
  });

  it('stops a manager changing settings', async () => {
    await assertFails(
      updateDoc(doc(asManager(), `restaurants/${RID}`), { name: 'Manager Name' }),
    );
  });

  it('stops an employee changing anything', async () => {
    await assertFails(
      updateDoc(doc(asEmployee(), `restaurants/${RID}`), { name: 'Nope' }),
    );
  });

  it('stops the owner reassigning ownership', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), { ownerUid: EMPLOYEE_UID }),
    );
  });
});

describe('restaurant settings validation', () => {
  const validSettings = {
    attendanceMode: 'both',
    faceVerifyThreshold: 0.8,
    faceReviewThreshold: 0.65,
    requireMarker: true,
    lateGraceMinutes: 15,
  };

  it('accepts a valid settings map', async () => {
    await assertSucceeds(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), { settings: validSettings }),
    );
  });

  it('rejects an unknown attendance mode', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, attendanceMode: 'telepathy' },
      }),
    );
  });

  it('rejects a threshold outside 0..1', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, faceVerifyThreshold: 1.5 },
      }),
    );
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, faceReviewThreshold: -0.2 },
      }),
    );
  });

  it('rejects a review threshold above the verify threshold', async () => {
    // Otherwise there is no band left to review, and everything either passes
    // or is rejected outright.
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: {
          ...validSettings,
          faceVerifyThreshold: 0.6,
          faceReviewThreshold: 0.9,
        },
      }),
    );
  });

  it('rejects a non-integer or out-of-range grace period', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, lateGraceMinutes: 10.5 },
      }),
    );
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, lateGraceMinutes: -1 },
      }),
    );
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, lateGraceMinutes: 9999 },
      }),
    );
  });

  it('rejects a wrong type for requireMarker', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, requireMarker: 'yes' },
      }),
    );
  });

  it('rejects a partial settings map', async () => {
    // A partial write would silently drop the missing settings.
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { attendanceMode: 'face' },
      }),
    );
  });

  it('rejects an extra unknown setting', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}`), {
        settings: { ...validSettings, allowEverything: true },
      }),
    );
  });
});

describe('the marker secret', () => {
  it('is unreadable by the owner, who can only print it via a callable', async () => {
    await assertFails(
      getDoc(doc(asOwner(), `restaurants/${RID}/private/checkin`)),
    );
  });

  it('is unreadable by a manager and by an employee', async () => {
    await assertFails(
      getDoc(doc(asManager(), `restaurants/${RID}/private/checkin`)),
    );
    await assertFails(
      getDoc(doc(asEmployee(), `restaurants/${RID}/private/checkin`)),
    );
  });

  it('is not writable by anyone', async () => {
    await assertFails(
      setDoc(doc(asOwner(), `restaurants/${RID}/private/checkin`), {
        markerSecret: 'mine-now',
        markerVersion: 1,
      }),
    );
  });
});

describe('employees', () => {
  const path = `restaurants/${RID}/employees/${EID}`;

  it('lets staff read any employee', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), path)));
    await assertSucceeds(getDoc(doc(asManager(), path)));
  });

  it('lets an employee read their own record', async () => {
    await assertSucceeds(getDoc(doc(asEmployee(), path)));
  });

  it('stops an employee reading a colleague', async () => {
    await assertFails(
      getDoc(doc(asEmployee(), `restaurants/${RID}/employees/${OTHER_EID}`)),
    );
  });

  it('stops another restaurant reading our employees', async () => {
    await assertFails(getDoc(doc(asOutsider(), path)));
  });

  it('lets staff edit the profile fields', async () => {
    await assertSucceeds(
      updateDoc(doc(asManager(), path), {
        name: 'Renamed Person',
        position: 'Chef',
        phone: '+923001234567',
        scheduledStart: '11:30',
      }),
    );
  });

  it('rejects a malformed scheduled start', async () => {
    for (const bad of ['9:00', '25:00', '09:60', 'morning', '0900']) {
      await assertFails(
        updateDoc(doc(asManager(), path), { scheduledStart: bad }),
      );
    }
  });

  it('accepts clearing the scheduled start', async () => {
    await assertSucceeds(
      updateDoc(doc(asManager(), path), { scheduledStart: null }),
    );
  });

  it('stops staff flipping active, which must go through the callable', async () => {
    // The callable also disables the Auth user and revokes their tokens;
    // flipping the flag alone would leave them able to sign in.
    await assertFails(updateDoc(doc(asOwner(), path), { active: false }));
  });

  it('stops anyone writing the face data', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), path), { 'face.status': 'rejected' }),
    );
    await assertFails(
      updateDoc(doc(asEmployee(), path), { 'face.embedding': [1, 0] }),
    );
    await assertFails(
      updateDoc(doc(asEmployee(), path), { 'face.status': 'approved' }),
    );
  });

  it('stops anyone writing presence — only recordAttendance may', async () => {
    await assertFails(
      updateDoc(doc(asEmployee(), path), { 'presence.status': 'in' }),
    );
    await assertFails(
      updateDoc(doc(asOwner(), path), { 'presence.status': 'in' }),
    );
  });

  it('stops an employee editing their own profile', async () => {
    await assertFails(updateDoc(doc(asEmployee(), path), { name: 'Better Name' }));
  });

  it('stops creating or deleting employees from a client', async () => {
    await assertFails(
      setDoc(doc(asOwner(), `restaurants/${RID}/employees/emp_new`), {
        name: 'Ghost',
        active: true,
      }),
    );
    await assertFails(deleteDoc(doc(asOwner(), path)));
  });
});

describe('attendance', () => {
  it('lets staff read every record', async () => {
    await assertSucceeds(
      getDocs(collection(asOwner(), `restaurants/${RID}/attendance`)),
    );
  });

  it('lets an employee read their own records', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asEmployee(), `restaurants/${RID}/attendance`),
          where('employeeId', '==', EID),
        ),
      ),
    );
  });

  it('stops an employee listing the whole collection', async () => {
    // Without the employeeId filter the rule cannot be satisfied per-document,
    // so the list is refused rather than silently filtered.
    await assertFails(
      getDocs(collection(asEmployee(), `restaurants/${RID}/attendance`)),
    );
  });

  it("stops an employee querying a colleague's records", async () => {
    await assertFails(
      getDocs(
        query(
          collection(asEmployee(), `restaurants/${RID}/attendance`),
          where('employeeId', '==', OTHER_EID),
        ),
      ),
    );
  });

  it("stops an employee reading a colleague's record directly", async () => {
    await assertFails(
      getDoc(doc(asEmployee(), `restaurants/${RID}/attendance/rec_theirs`)),
    );
    await assertSucceeds(
      getDoc(doc(asEmployee(), `restaurants/${RID}/attendance/rec_mine`)),
    );
  });

  it('refuses every client write, including by the owner', async () => {
    await assertFails(
      setDoc(doc(asEmployee(), `restaurants/${RID}/attendance/forged`), {
        employeeId: EID,
        type: 'check_in',
        status: 'verified',
      }),
    );
    await assertFails(
      updateDoc(doc(asOwner(), `restaurants/${RID}/attendance/rec_mine`), {
        status: 'rejected',
      }),
    );
    await assertFails(
      deleteDoc(doc(asOwner(), `restaurants/${RID}/attendance/rec_mine`)),
    );
  });
});

describe('the photo reuse ledger', () => {
  it('is invisible and unwritable to every client', async () => {
    for (const db of [asOwner(), asManager(), asEmployee()]) {
      await assertFails(
        getDoc(doc(db, `restaurants/${RID}/photoHashes/abc123`)),
      );
      await assertFails(
        setDoc(doc(db, `restaurants/${RID}/photoHashes/deadbeef`), {
          recordId: 'x',
        }),
      );
    }
  });

  it('cannot be deleted to allow a photo to be replayed', async () => {
    await assertFails(
      deleteDoc(doc(asOwner(), `restaurants/${RID}/photoHashes/abc123`)),
    );
  });
});

describe('collections that do not exist in the data model', () => {
  it('are denied by the catch-all rule', async () => {
    await assertFails(getDoc(doc(asOwner(), 'secrets/anything')));
    await assertFails(setDoc(doc(asOwner(), 'secrets/anything'), { a: 1 }));
  });
});


describe('location settings validation', () => {
  const settings = {
    attendanceMode: 'both', faceVerifyThreshold: 0.75, faceReviewThreshold: 0.6,
    requireMarker: true, lateGraceMinutes: 10, requireLocation: true,
    locationLat: 24.86, locationLng: 67.01, locationRadiusMeters: 100,
  };
  it('allows the owner to configure and disable the fence', async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), `restaurants/${RID}`), { settings }));
    await assertSucceeds(updateDoc(doc(asOwner(), `restaurants/${RID}`), { 'settings.requireLocation': false }));
  });
  it.each([
    ['locationLat', 91], ['locationLat', -91], ['locationLng', 181], ['locationLng', -181],
    ['locationRadiusMeters', 9], ['locationRadiusMeters', 5001], ['requireLocation', 'true'],
    ['locationLat', '24.86'], ['locationRadiusMeters', '100'],
  ])('rejects invalid %s: %s', async (key, value) => {
    await assertFails(updateDoc(doc(asOwner(), `restaurants/${RID}`), {settings: {...settings, [key]: value}}));
  });
  it('rejects managers and employees changing the fence', async () => {
    for (const db of [asManager(), asEmployee()]) {
      await assertFails(updateDoc(doc(db, `restaurants/${RID}`), {settings}));
    }
  });
});
