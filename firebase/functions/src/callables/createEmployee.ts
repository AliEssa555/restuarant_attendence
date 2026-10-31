import { onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CALL_OPTS } from '../lib/callable';
import { STAFF, assertRole } from '../lib/auth';
import { createAuthAccount, rollbackAccount } from '../lib/accounts';
import { internal, invalidArgument } from '../lib/errors';
import { db, employeesRef, userRef } from '../lib/paths';

const Input = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(32).optional(),
  position: z.string().trim().max(40).optional(),
  scheduledStart: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use HH:mm, for example 09:00')
    .optional(),
});

/**
 * Create an employee: an Auth account, the employee document, and the mirrored
 * user document, with claims { role: 'employee', rid, eid }.
 *
 * Returns the temporary password **once**. The portal must show it immediately;
 * there is no way to read it back afterwards, only to reset it.
 */
export const createEmployee = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, STAFF);

  const parsed = Input.safeParse(request.data);
  if (!parsed.success) invalidArgument('Check the employee details.', parsed.error.flatten());
  const { name, email, phone, position, scheduledStart } = parsed.data;

  // Allocate the employee id up front so it can go into the custom claims.
  const employeeDoc = employeesRef(caller.rid).doc();
  const eid = employeeDoc.id;

  const account = await createAuthAccount(email, name);

  try {
    await getAuth().setCustomUserClaims(account.uid, {
      role: 'employee',
      rid: caller.rid,
      eid,
    });

    const batch = db().batch();
    batch.create(employeeDoc, {
      name,
      email,
      phone,
      position,
      uid: account.uid,
      active: true,
      scheduledStart,
      face: { status: 'none' },
      presence: { status: 'out' },
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.create(userRef(account.uid), {
      role: 'employee',
      restaurantId: caller.rid,
      employeeId: eid,
      displayName: name,
      email,
      mustChangePassword: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    await rollbackAccount(account.uid);
    const detail = err instanceof Error ? err.message : 'unknown error';
    internal('Created the login but could not save the employee record: ' + detail);
  }

  return {
    employeeId: eid,
    uid: account.uid,
    email,
    tempPassword: account.tempPassword,
  };
});
