import { onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CALL_OPTS } from '../lib/callable';
import { OWNER_ONLY, assertRole } from '../lib/auth';
import { createAuthAccount, rollbackAccount } from '../lib/accounts';
import { internal, invalidArgument } from '../lib/errors';
import { userRef } from '../lib/paths';

const Input = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  // Only managers can be created this way; a restaurant has exactly one owner.
  role: z.literal('manager').default('manager'),
});

/**
 * Owner-only: create a manager account for this restaurant.
 *
 * Managers get no employee document and no eid claim, which is what stops them
 * from using the mobile check-in. In the portal they can do everything except
 * change restaurant settings, rotate the marker, or create other managers.
 */
export const createStaff = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, OWNER_ONLY);

  const parsed = Input.safeParse(request.data);
  if (!parsed.success) invalidArgument('Check the manager details.', parsed.error.flatten());
  const { name, email } = parsed.data;

  const account = await createAuthAccount(email, name);

  try {
    await getAuth().setCustomUserClaims(account.uid, { role: 'manager', rid: caller.rid });
    await userRef(account.uid).create({
      role: 'manager',
      restaurantId: caller.rid,
      displayName: name,
      email,
      mustChangePassword: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    await rollbackAccount(account.uid);
    const detail = err instanceof Error ? err.message : 'unknown error';
    internal('Created the login but could not save the manager record: ' + detail);
  }

  return { uid: account.uid, email, tempPassword: account.tempPassword };
});
