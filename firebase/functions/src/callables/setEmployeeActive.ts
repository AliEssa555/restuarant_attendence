import { onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { CALL_OPTS } from '../lib/callable';
import { STAFF, assertRole } from '../lib/auth';
import { invalidArgument, notFound } from '../lib/errors';
import { employeeRef } from '../lib/paths';
import type { EmployeeDoc } from '../lib/types';

const Input = z.object({
  employeeId: z.string().trim().min(1),
  active: z.boolean(),
});

/**
 * Enable or disable an employee.
 *
 * Disabling does three things, and all three matter: it flips `active` (so
 * recordAttendance refuses), disables the Auth user (so they cannot sign in),
 * and revokes refresh tokens (so an already-signed-in phone is logged out at
 * its next token refresh instead of keeping a valid session for an hour).
 */
export const setEmployeeActive = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, STAFF);

  const parsed = Input.safeParse(request.data);
  if (!parsed.success) invalidArgument('Which employee?', parsed.error.flatten());
  const { employeeId, active } = parsed.data;

  const ref = employeeRef(caller.rid, employeeId);
  const snap = await ref.get();
  if (!snap.exists) notFound('Employee not found.');
  const employee = snap.data() as EmployeeDoc;

  await getAuth().updateUser(employee.uid, { disabled: !active });
  if (!active) {
    await getAuth().revokeRefreshTokens(employee.uid);
  }
  await ref.update({ active });

  return { employeeId, active };
});
