import { LOCATION_MAX_AGE_MS, LOCATION_MAX_ACCURACY_M } from '../config';
import { failedPrecondition, REASON } from './errors';
import type { RestaurantSettings } from './types';
export interface GpsCoords { lat: number; lng: number; accuracy: number; isMockLocation: boolean; timestampMs: number }
export function haversine(lat: number, lng: number, targetLat: number, targetLng: number) {
  const rad = (x: number) => x * Math.PI / 180;
  const a = Math.sin(rad(targetLat-lat)/2)**2 + Math.cos(rad(lat))*Math.cos(rad(targetLat))*Math.sin(rad(targetLng-lng)/2)**2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function assertLocation(coords: GpsCoords | undefined, settings: RestaurantSettings, now: Date): number {
  if (!coords) {
    if (settings.requireLocation) failedPrecondition('Enable location access to check in.', {code: REASON.LOCATION_REQUIRED});
    return 0;
  }
  const distance = haversine(coords.lat, coords.lng, settings.locationLat, settings.locationLng);
  // An owner disabling the fence disables location rejection, while supplied evidence is still retained.
  if (!settings.requireLocation) return distance;
  if (coords.isMockLocation) failedPrecondition('Mock location detected.', {code: REASON.LOCATION_MOCK});
  if (!Number.isFinite(coords.accuracy) || coords.accuracy < 0 || coords.accuracy > LOCATION_MAX_ACCURACY_M)
    failedPrecondition('GPS accuracy is too low. Move outside and try again.', {code: REASON.LOCATION_ACCURACY_LOW});
  const age = now.getTime() - coords.timestampMs;
  if (!Number.isFinite(age) || age < 0 || age > LOCATION_MAX_AGE_MS)
    failedPrecondition('Capture a fresh location.', {code: REASON.LOCATION_STALE});
  if (!Number.isFinite(distance) || Math.abs(coords.lat)>90 || Math.abs(coords.lng)>180 || distance > settings.locationRadiusMeters)
    failedPrecondition('You are outside the restaurant area.', {code: REASON.LOCATION_OUT_OF_RANGE});
  return distance;
}
