/**
 * Seed a demo restaurant: one owner, one manager, six employees and seven days
 * of mixed attendance (TECHNICAL_PLAN.md M7).
 *
 *   cd scripts
 *   npm run seed            # against the Emulator Suite
 *
 * Safety: this deletes and rewrites the demo restaurant, so by default it
 * refuses to run against anything but the emulators. Pass `--allow-production`
 * (and the usual Admin SDK credentials) if you really mean it.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

const PROJECT_ID = process.env.SEED_PROJECT_ID ?? 'restaurant-attendance-demo';
const EMULATOR_HOST = process.env.SEED_EMULATOR_HOST ?? '127.0.0.1';
const ALLOW_PRODUCTION = process.argv.includes('--allow-production');

const OWNER_EMAIL = 'owner@demo.test';
const MANAGER_EMAIL = 'manager@demo.test';
const DEMO_PASSWORD = 'demo1234';

const TIMEZONE = 'Asia/Karachi';
const RESTAURANT_NAME = 'Karachi Grill';

/** Seven days including today. */
const DAYS = 7;

interface SeedEmployee {
  name: string;
  email: string;
  position: string;
  scheduledStart: string;
  faceStatus: 'none' | 'pending' | 'approved';
  /** Rough chance this person is late on any given day. */
  latenessRate: number;
  /** Set for the one employee who is deliberately left deactivated. */
  active?: boolean;
}

const EMPLOYEES: SeedEmployee[] = [
  {
    name: 'Ayesha Khan',
    email: 'ayesha@demo.test',
    position: 'Manager on duty',
    scheduledStart: '09:00',
    faceStatus: 'approved',
    latenessRate: 0,
  },
  {
    name: 'Bilal Ahmed',
    email: 'bilal@demo.test',
    position: 'Head chef',
    scheduledStart: '08:00',
    faceStatus: 'approved',
    latenessRate: 0.15,
  },
  {
    name: 'Fatima Noor',
    email: 'fatima@demo.test',
    position: 'Waiter',
    scheduledStart: '11:00',
    faceStatus: 'approved',
    latenessRate: 0.45,
  },
  {
    name: 'Hamza Sheikh',
    email: 'hamza@demo.test',
    position: 'Waiter',
    scheduledStart: '11:00',
    // Waiting on manager approval, so the Reviews tab is not empty on a fresh
    // seed.
    faceStatus: 'pending',
    latenessRate: 0.2,
  },
  {
    name: 'Sana Iqbal',
    email: 'sana@demo.test',
    position: 'Cashier',
    scheduledStart: '10:30',
    faceStatus: 'none',
    latenessRate: 0.1,
  },
  {
    name: 'Usman Tariq',
    email: 'usman@demo.test',
    position: 'Kitchen porter',
    scheduledStart: '07:30',
    faceStatus: 'approved',
    latenessRate: 0.25,
    active: false,
  },
];

/**
 * Deterministic PRNG, so two runs of the seed produce the same demo — a
 * screenshot or a bug report stays reproducible.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
const random = makeRandom(20260314);

/** A unit-length pseudo-embedding, shaped like the real thing. */
function fakeEmbedding(seed: number, length = 192): number[] {
  const rnd = makeRandom(seed);
  const raw = Array.from({ length }, () => rnd() - 0.5);
  const norm = Math.sqrt(raw.reduce((sum, n) => sum + n * n, 0));
  return raw.map((n) => n / norm);
}

/** `YYYY-MM-DD` in the restaurant's timezone, as the server would write it. */
function localDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return parts;
}

/**
 * The instant corresponding to a local wall-clock time on a given day.
 *
 * Karachi has no DST, so a fixed offset is exact here; this is a seed script,
 * not the lateness logic the server runs (see `computeLateness`).
 */
const KARACHI_OFFSET_MINUTES = 5 * 60;
function atLocalTime(daysAgo: number, hhmm: string, jitterMinutes = 0): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const base = new Date();
  base.setUTCDate(base.getUTCDate() - daysAgo);
  base.setUTCHours(0, 0, 0, 0);
  const totalMinutes =
    hours * 60 + minutes + jitterMinutes - KARACHI_OFFSET_MINUTES;
  return new Date(base.getTime() + totalMinutes * 60_000);
}

async function main(): Promise<void> {
  const usingEmulators =
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) || !ALLOW_PRODUCTION;

  if (usingEmulators) {
    // Set before initializeApp so the Admin SDK picks them up.
    process.env.FIRESTORE_EMULATOR_HOST ??= `${EMULATOR_HOST}:8080`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `${EMULATOR_HOST}:9099`;
    process.env.STORAGE_EMULATOR_HOST ??= `http://${EMULATOR_HOST}:9199`;
    console.log(`Seeding the emulators at ${EMULATOR_HOST} (project ${PROJECT_ID}).`);
  } else {
    console.log(`Seeding the REAL project ${PROJECT_ID}.`);
  }

  initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  // --- owner, restaurant, marker ------------------------------------------
  const ownerUid = await upsertUser(OWNER_EMAIL, 'Demo Owner');
  const restaurantRef = db.collection('restaurants').doc();
  const rid = restaurantRef.id;

  await auth.setCustomUserClaims(ownerUid, { role: 'owner', rid });
  await restaurantRef.set({
    name: RESTAURANT_NAME,
    timezone: TIMEZONE,
    ownerUid,
    createdAt: FieldValue.serverTimestamp(),
    settings: {
      attendanceMode: 'both',
      faceVerifyThreshold: 0.75,
      faceReviewThreshold: 0.6,
      requireMarker: true,
      lateGraceMinutes: 10,
    },
  });
  await restaurantRef.collection('private').doc('checkin').set({
    markerSecret: randomBytes(32).toString('base64url'),
    markerVersion: 1,
    rotatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(ownerUid).set({
    role: 'owner',
    restaurantId: rid,
    displayName: 'Demo Owner',
    email: OWNER_EMAIL,
    mustChangePassword: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // --- manager -------------------------------------------------------------
  const managerUid = await upsertUser(MANAGER_EMAIL, 'Demo Manager');
  await auth.setCustomUserClaims(managerUid, { role: 'manager', rid });
  await db.collection('users').doc(managerUid).set({
    role: 'manager',
    restaurantId: rid,
    displayName: 'Demo Manager',
    email: MANAGER_EMAIL,
    mustChangePassword: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // --- employees -----------------------------------------------------------
  const created: Array<{ eid: string; employee: SeedEmployee }> = [];

  for (const [index, employee] of EMPLOYEES.entries()) {
    const uid = await upsertUser(employee.email, employee.name);
    const employeeRef = restaurantRef.collection('employees').doc();
    const eid = employeeRef.id;
    const active = employee.active ?? true;

    await auth.setCustomUserClaims(uid, { role: 'employee', rid, eid });
    await auth.updateUser(uid, { disabled: !active });

    const enrolled = employee.faceStatus !== 'none';
    await employeeRef.set({
      name: employee.name,
      email: employee.email,
      position: employee.position,
      uid,
      active,
      scheduledStart: employee.scheduledStart,
      face: {
        status: employee.faceStatus,
        enrolPhotoPath: enrolled
          ? `faces/${rid}/${eid}/enrol-seeded.jpg`
          : undefined,
        embedding: enrolled ? fakeEmbedding(index + 1) : undefined,
        modelVersion: enrolled ? 'mobilefacenet-v1' : undefined,
        submittedAt: enrolled ? Timestamp.fromDate(atLocalTime(DAYS, '08:00')) : undefined,
        reviewedBy: employee.faceStatus === 'approved' ? ownerUid : undefined,
        reviewedAt:
          employee.faceStatus === 'approved'
            ? Timestamp.fromDate(atLocalTime(DAYS, '09:00'))
            : undefined,
      },
      presence: { status: 'out' },
      createdAt: Timestamp.fromDate(atLocalTime(DAYS + 1, '09:00')),
    });

    created.push({ eid, employee });
    // No enrolment photo is uploaded: a path pointing at nothing renders as
    // "No photo" in the portal, which is honest about seeded data.
  }

  // --- attendance ----------------------------------------------------------
  const counts = await seedAttendance(restaurantRef, created);

  console.log('');
  console.log('Seeded.');
  console.log(`  Restaurant : ${RESTAURANT_NAME} (${rid})`);
  console.log(`  Owner      : ${OWNER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Manager    : ${MANAGER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Employees  : ${created.length}, password ${DEMO_PASSWORD}`);
  for (const { employee } of created) {
    console.log(
      `               ${employee.email.padEnd(20)} ${employee.position}` +
        `${employee.active === false ? ' (inactive)' : ''}` +
        `${employee.faceStatus === 'pending' ? ' (enrolment awaiting review)' : ''}`,
    );
  }
  console.log(
    `  Attendance : ${counts.total} records ` +
      `(${counts.late} late, ${counts.pending} in review, ${counts.rejected} rejected)`,
  );
  console.log('');
  console.log('Sign in to the portal at http://localhost:3000 with the owner account.');
}

/** Create the account, or reset it if the seed has been run before. */
async function upsertUser(email: string, displayName: string): Promise<string> {
  const auth = getAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      displayName,
      password: DEMO_PASSWORD,
      disabled: false,
    });
    return existing.uid;
  } catch {
    const user = await auth.createUser({
      email,
      password: DEMO_PASSWORD,
      displayName,
      emailVerified: true,
    });
    return user.uid;
  }
}

interface Counts {
  total: number;
  late: number;
  pending: number;
  rejected: number;
}

/**
 * Seven days of check-ins and check-outs.
 *
 * The mix is deliberate rather than random: the portal should have something in
 * every state on a fresh seed, so each screen can be demonstrated without
 * waiting for real traffic. The last day stops at check-in for two people, so
 * the dashboard shows somebody actually "in now".
 */
async function seedAttendance(
  restaurantRef: DocumentReference,
  employees: Array<{ eid: string; employee: SeedEmployee }>,
): Promise<Counts> {
  const rid = restaurantRef.id;
  const db = getFirestore();
  const counts: Counts = { total: 0, late: 0, pending: 0, rejected: 0 };

  // Firestore batches cap at 500 writes; this stays well under, but the writes
  // are chunked anyway so the shape survives a bigger EMPLOYEES list.
  let batch = db.batch();
  let batched = 0;
  const flush = async (force = false) => {
    if (batched >= 400 || (force && batched > 0)) {
      await batch.commit();
      batch = db.batch();
      batched = 0;
    }
  };

  const presence = new Map<string, { status: 'in' | 'out'; at: Date; id: string }>();

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const isToday = daysAgo === 0;

    for (const [index, { eid, employee }] of employees.entries()) {
      if (employee.active === false) continue;

      // One person has a day off mid-week, so "Not in yet" is not always zero.
      if (daysAgo === 3 && index === 2) continue;

      const late = random() < employee.latenessRate;
      const jitter = late
        ? 12 + Math.floor(random() * 50)
        : -8 + Math.floor(random() * 9);

      const canUseFace = employee.faceStatus === 'approved';
      const method: 'face' | 'manual' = canUseFace && random() > 0.25 ? 'face' : 'manual';

      // Statuses: mostly verified, with a flagged one and a rejected one so the
      // review queue and the audit trail both have content.
      let status: 'verified' | 'pending_review' | 'rejected' = 'verified';
      let rejectReason: string | undefined;
      let similarity: number | null = null;

      if (method === 'face') {
        const roll = random();
        if (roll > 0.92) {
          status = 'pending_review';
          similarity = 0.62 + random() * 0.12;
        } else if (roll > 0.88) {
          status = 'rejected';
          rejectReason = random() > 0.5 ? 'MARKER_NOT_FOUND' : 'FACE_MISMATCH';
          similarity = rejectReason === 'FACE_MISMATCH' ? 0.3 + random() * 0.25 : null;
        } else {
          similarity = 0.82 + random() * 0.16;
        }
      }

      const inAt = atLocalTime(daysAgo, employee.scheduledStart, jitter);
      const minutesLate = Math.max(0, jitter);
      const isLate = minutesLate > 10;

      const checkInRef = restaurantRef.collection('attendance').doc();
      batch.set(checkInRef, {
        employeeId: eid,
        employeeName: employee.name,
        type: 'check_in',
        method,
        status,
        rejectReason,
        createdAt: Timestamp.fromDate(inAt),
        localDate: localDate(inAt),
        late: isLate,
        minutesLate,
        face:
          method === 'face'
            ? {
                photoPath: `checkins/${rid}/${eid}/${inAt.getTime()}.jpg`,
                modelVersion: 'mobilefacenet-v1',
                similarity,
                facesDetected: 1,
                markerFound: rejectReason !== 'MARKER_NOT_FOUND',
                markerValid: rejectReason !== 'MARKER_NOT_FOUND',
              }
            : undefined,
        device: { platform: 'android', appVersion: '0.1.0' },
        clientRequestId: `seed-${eid}-${daysAgo}-in`,
      });
      batched++;
      counts.total++;
      if (isLate) counts.late++;
      if (status === 'pending_review') counts.pending++;
      if (status === 'rejected') counts.rejected++;

      // A rejected attempt never moved presence, so no check-out follows it.
      if (status !== 'rejected') {
        presence.set(eid, { status: 'in', at: inAt, id: checkInRef.id });

        // Two people are still on shift today — that is what makes "In now"
        // non-zero on the dashboard.
        const stayIn = isToday && index % 3 === 0;
        if (!stayIn) {
          const outAt = new Date(inAt.getTime() + (7.5 + random() * 2) * 3_600_000);
          if (outAt.getTime() < Date.now()) {
            const checkOutRef = restaurantRef.collection('attendance').doc();
            batch.set(checkOutRef, {
              employeeId: eid,
              employeeName: employee.name,
              type: 'check_out',
              method,
              status: 'verified',
              createdAt: Timestamp.fromDate(outAt),
              localDate: localDate(outAt),
              face:
                method === 'face'
                  ? {
                      photoPath: `checkins/${rid}/${eid}/${outAt.getTime()}.jpg`,
                      modelVersion: 'mobilefacenet-v1',
                      similarity: 0.84 + random() * 0.14,
                      facesDetected: 1,
                      markerFound: true,
                      markerValid: true,
                    }
                  : undefined,
              device: { platform: 'android', appVersion: '0.1.0' },
              clientRequestId: `seed-${eid}-${daysAgo}-out`,
            });
            batched++;
            counts.total++;
            presence.set(eid, { status: 'out', at: outAt, id: checkOutRef.id });
          }
        }
      }

      await flush();
    }
  }

  // Presence must agree with the last surviving record, or the dashboard and
  // the records would contradict each other.
  for (const [eid, state] of presence) {
    batch.update(restaurantRef.collection('employees').doc(eid), {
      'presence.status': state.status,
      'presence.lastEventAt': Timestamp.fromDate(state.at),
      'presence.lastRecordId': state.id,
    });
    batched++;
    await flush();
  }

  await flush(true);
  return counts;
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
