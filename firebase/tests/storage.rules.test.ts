import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  getBytes,
  getDownloadURL,
  deleteObject,
  ref,
  uploadBytes,
} from 'firebase/storage';

import {
  EID,
  EMPLOYEE_UID,
  MANAGER_UID,
  OTHER_EID,
  OTHER_EMPLOYEE_UID,
  OUTSIDER_UID,
  OWNER_UID,
  RID,
  TINY_JPEG,
  claims,
  makeTestEnv,
} from './helpers';

/**
 * Storage security rules (TECHNICAL_PLAN.md §6).
 *
 * The important properties are that an employee can only *create* objects under
 * their own prefix, and that nothing is ever updatable or deletable from a
 * client — an uploaded check-in photo has to stay as immutable evidence, or the
 * audit trail the whole design leans on is worthless.
 */
let env: RulesTestEnvironment;

const JPEG = { contentType: 'image/jpeg' } as const;

const asOwner = () => env.authenticatedContext(OWNER_UID, claims.owner).storage();
const asManager = () =>
  env.authenticatedContext(MANAGER_UID, claims.manager).storage();
const asEmployee = () =>
  env.authenticatedContext(EMPLOYEE_UID, claims.employee).storage();
const asOtherEmployee = () =>
  env.authenticatedContext(OTHER_EMPLOYEE_UID, claims.otherEmployee).storage();
const asOutsider = () =>
  env.authenticatedContext(OUTSIDER_UID, claims.otherRestaurantOwner).storage();
const asAnonymous = () => env.unauthenticatedContext().storage();

const enrolPath = `faces/${RID}/${EID}/enrol-1.jpg`;
const checkinPath = `checkins/${RID}/${EID}/1700000000.jpg`;

beforeAll(async () => {
  env = await makeTestEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('enrolment photos', () => {
  it('can be uploaded by the employee they belong to', async () => {
    await assertSucceeds(
      uploadBytes(ref(asEmployee(), enrolPath), TINY_JPEG, JPEG),
    );
  });

  it('cannot be uploaded into a colleague folder', async () => {
    await assertFails(
      uploadBytes(
        ref(asEmployee(), `faces/${RID}/${OTHER_EID}/enrol-1.jpg`),
        TINY_JPEG,
        JPEG,
      ),
    );
  });

  it('cannot be uploaded into another restaurant', async () => {
    await assertFails(
      uploadBytes(
        ref(asEmployee(), `faces/rest_2/${EID}/enrol-1.jpg`),
        TINY_JPEG,
        JPEG,
      ),
    );
  });

  it('cannot be uploaded by a manager on an employee behalf', async () => {
    // Only the employee may create their own enrolment photo, so a manager
    // cannot enrol a face for someone who never stood in front of a camera.
    await assertFails(
      uploadBytes(ref(asManager(), enrolPath), TINY_JPEG, JPEG),
    );
  });

  it('cannot be uploaded anonymously', async () => {
    await assertFails(
      uploadBytes(ref(asAnonymous(), enrolPath), TINY_JPEG, JPEG),
    );
  });

  it('are readable by staff and by the employee themselves', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), enrolPath), TINY_JPEG, JPEG);
    });
    await assertSucceeds(getDownloadURL(ref(asOwner(), enrolPath)));
    await assertSucceeds(getDownloadURL(ref(asManager(), enrolPath)));
    await assertSucceeds(getDownloadURL(ref(asEmployee(), enrolPath)));
  });

  it('are not readable by a colleague or another restaurant', async () => {
    await assertFails(getDownloadURL(ref(asOtherEmployee(), enrolPath)));
    await assertFails(getDownloadURL(ref(asOutsider(), enrolPath)));
  });
});

describe('check-in photos', () => {
  it('can be uploaded by the employee checking in', async () => {
    await assertSucceeds(
      uploadBytes(ref(asEmployee(), checkinPath), TINY_JPEG, JPEG),
    );
  });

  it('cannot be uploaded into a colleague folder', async () => {
    await assertFails(
      uploadBytes(
        ref(asEmployee(), `checkins/${RID}/${OTHER_EID}/1.jpg`),
        TINY_JPEG,
        JPEG,
      ),
    );
  });

  it('are readable by staff', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), checkinPath), TINY_JPEG, JPEG);
    });
    await assertSucceeds(getDownloadURL(ref(asOwner(), checkinPath)));
    await assertSucceeds(getDownloadURL(ref(asManager(), checkinPath)));
  });

  it('are not readable by the employee who took them', async () => {
    // Check-in photos are evidence for the manager. Letting the employee
    // re-download one makes it that bit easier to fish for a frame that passes.
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), checkinPath), TINY_JPEG, JPEG);
    });
    await assertFails(getDownloadURL(ref(asEmployee(), checkinPath)));
  });

  it('are not readable by another restaurant', async () => {
    await assertFails(getDownloadURL(ref(asOutsider(), checkinPath)));
  });
});

describe('immutability', () => {
  it('refuses overwriting an existing photo', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), checkinPath), TINY_JPEG, JPEG);
    });
    await assertFails(
      uploadBytes(ref(asEmployee(), checkinPath), Buffer.concat([TINY_JPEG, Buffer.from([0])]), JPEG),
    );
  });

  it('refuses deletion by the employee, a manager or the owner', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), checkinPath), TINY_JPEG, JPEG);
    });
    await assertFails(deleteObject(ref(asEmployee(), checkinPath)));
    await assertFails(deleteObject(ref(asManager(), checkinPath)));
    await assertFails(deleteObject(ref(asOwner(), checkinPath)));
  });
});

describe('content restrictions', () => {
  it('refuses a non-JPEG upload', async () => {
    await assertFails(
      uploadBytes(
        ref(asEmployee(), `checkins/${RID}/${EID}/not-a-photo.png`),
        TINY_JPEG,
        { contentType: 'image/png' },
      ),
    );
  });

  it('refuses an upload with no declared content type', async () => {
    await assertFails(
      uploadBytes(ref(asEmployee(), `checkins/${RID}/${EID}/bare.jpg`), TINY_JPEG),
    );
  });

  it('refuses a file over 3 MB', async () => {
    const tooBig = Buffer.alloc(3 * 1024 * 1024 + 1024, 1);
    await assertFails(
      uploadBytes(ref(asEmployee(), `checkins/${RID}/${EID}/huge.jpg`), tooBig, JPEG),
    );
  });
});

describe('paths outside the data model', () => {
  it('are denied entirely', async () => {
    await assertFails(
      uploadBytes(ref(asEmployee(), 'anywhere/else.jpg'), TINY_JPEG, JPEG),
    );
    await assertFails(getBytes(ref(asOwner(), 'anywhere/else.jpg')));
  });
});
