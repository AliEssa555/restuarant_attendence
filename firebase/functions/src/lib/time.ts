import { restaurantRef } from './paths';
import { notFound } from './errors';
import type { RestaurantDoc } from './types';
import { DEFAULT_SETTINGS } from '../config';
export function isValidTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en', {timeZone: timezone}).format(); return true; } catch { return false; }
}
export async function getRestaurant(rid: string): Promise<RestaurantDoc> {
  const snap = await restaurantRef(rid).get();
  if (!snap.exists) notFound('Restaurant not found.');
  const data = snap.data() as RestaurantDoc;
  return { ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
}
export function toLocalDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function computeLateness(now: Date, timezone: string, scheduledStart: string | undefined, grace: number) {
  if (!scheduledStart) return { late: false, minutesLate: 0 };
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: timezone, hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')!.value);
  const minute = Number(parts.find(p => p.type === 'minute')!.value);
  const [h,m] = scheduledStart.split(':').map(Number);
  const minutesLate = Math.max(0, hour*60 + minute - h*60 - m);
  return { late: minutesLate > grace, minutesLate };
}
