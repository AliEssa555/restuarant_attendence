import { onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { CALL_OPTS } from '../lib/callable';
import { OWNER_ONLY, STAFF, assertRole } from '../lib/auth';
import { notFound } from '../lib/errors';
import { markerRef } from '../lib/paths';
import { buildMarkerPayload } from '../lib/marker';
import { generateMarkerSecret } from '../lib/secrets';
import { getRestaurant } from '../lib/time';
import type { MarkerDoc } from '../lib/types';

/**
 * Return the QR payload for the printable poster.
 *
 * This is the only path by which the marker secret leaves the server, which is
 * why `restaurants/{rid}/private/**` denies all client access in the security
 * rules: a manager can print the poster, but cannot read the secret out of
 * Firestore and paste it into a forged check-in.
 */
export const getMarkerPayload = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, STAFF);

  const [restaurant, markerSnap] = await Promise.all([
    getRestaurant(caller.rid),
    markerRef(caller.rid).get(),
  ]);
  if (!markerSnap.exists) notFound('This restaurant has no check-in marker yet.');
  const marker = markerSnap.data() as MarkerDoc;

  return {
    payload: buildMarkerPayload({
      rid: caller.rid,
      markerVersion: marker.markerVersion,
      markerSecret: marker.markerSecret,
    }),
    markerVersion: marker.markerVersion,
    rotatedAt: marker.rotatedAt?.toMillis() ?? null,
    restaurantName: restaurant.name,
    timezone: restaurant.timezone,
  };
});

/**
 * Owner-only: issue a new marker secret and bump the version.
 *
 * Every printed poster stops working the moment this returns, because
 * `decodeMarker` compares against the current version and secret. The portal
 * warns about reprinting before calling this.
 */
export const rotateMarker = onCall(CALL_OPTS, async (request) => {
  const caller = assertRole(request, OWNER_ONLY);

  const ref = markerRef(caller.rid);
  const markerSecret = generateMarkerSecret();

  const markerVersion = await ref.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as MarkerDoc).markerVersion ?? 0 : 0;
    const next = current + 1;
    tx.set(
      ref,
      { markerSecret, markerVersion: next, rotatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return next;
  });

  return {
    payload: buildMarkerPayload({ rid: caller.rid, markerVersion, markerSecret }),
    markerVersion,
  };
});
