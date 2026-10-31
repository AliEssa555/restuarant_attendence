import { onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CALL_OPTS } from '../lib/callable';
import { DEFAULT_SETTINGS } from '../config';
import { failedPrecondition, invalidArgument, unauthenticated } from '../lib/errors';
import { db, markerRef, restaurantRef, userRef } from '../lib/paths';
import { generateMarkerSecret } from '../lib/secrets';
import { isValidTimezone } from '../lib/time';

const Input = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(3).max(64),
  displayName: z.string().trim().min(2).max(80).optional(),
});

/**
 * Turn a freshly signed-up Firebase user into the owner of a new restaurant.
 *
 * This is the only callable that doesn't use `assertRole`: the caller has no
 * `rid` claim yet, which is precisely the pre-condition we check. Creating the
 * restaurant, its private marker secret and the owner's user doc happens in one
 * batch so a half-created restaurant can't exist.
 */
export const createRestaurant = onCall(CALL_OPTS, async (request) => {
  if (!request.auth) unauthenticated();
  const { uid, token } = request.auth;

  const parsed = Input.safeParse(request.data);
  if (!parsed.success) invalidArgument('Check the restaurant name and timezone.', parsed.error.flatten());
  const { name, timezone, displayName } = parsed.data;

  if (!isValidTimezone(timezone)) {
    invalidArgument(`"${timezone}" is not a timezone this server recognises.`);
  }

  // Already attached to a restaurant? Claims are authoritative, but a user doc
  // can exist before the token refreshes, so check both.
  if (token.rid) {
    failedPrecondition('This account already belongs to a restaurant.');
  }
  const existingUser = await userRef(uid).get();
  if (existingUser.exists) {
    failedPrecondition('This account already belongs to a restaurant.');
  }

  const restaurant = restaurantRef(db().collection('restaurants').doc().id);
  const rid = restaurant.id;

  const batch = db().batch();
  batch.create(restaurant, {
    name,
    timezone,
    ownerUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    settings: { ...DEFAULT_SETTINGS },
  });
  batch.create(markerRef(rid), {
    markerSecret: generateMarkerSecret(),
    markerVersion: 1,
    rotatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(userRef(uid), {
    role: 'owner',
    restaurantId: rid,
    displayName: displayName ?? token.name ?? token.email ?? 'Owner',
    email: token.email ?? '',
    mustChangePassword: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  await getAuth().setCustomUserClaims(uid, { role: 'owner', rid });

  // The client must call `getIdToken(true)` after this returns, or its next
  // Firestore read will still be using a token with no `rid`.
  return { restaurantId: rid, role: 'owner' as const };
});
