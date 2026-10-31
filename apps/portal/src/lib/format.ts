import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Timestamp } from 'firebase/firestore';

/**
 * Every time in the portal is rendered in the **restaurant's** timezone, not
 * the manager's browser timezone. An owner checking the dashboard from abroad
 * must see the same clock their staff are working to.
 */

export function toDate(value: Timestamp | undefined | null): Date | null {
  if (!value) return null;
  return value.toDate();
}

export function timeIn(tz: string, at: Date | null | undefined): string {
  if (!at) return '—';
  return formatInTimeZone(at, tz, 'h:mm a');
}

export function dateTimeIn(tz: string, at: Date | null | undefined): string {
  if (!at) return '—';
  return formatInTimeZone(at, tz, 'd MMM yyyy, h:mm a');
}

export function dateIn(tz: string, at: Date | null | undefined): string {
  if (!at) return '—';
  return formatInTimeZone(at, tz, 'd MMM yyyy');
}

/** `YYYY-MM-DD` in the restaurant's zone — matches the stored `localDate`. */
export function localDateIn(tz: string, at: Date = new Date()): string {
  return formatInTimeZone(at, tz, 'yyyy-MM-dd');
}

/** `YYYY-MM-DD` for a date input, in the browser's zone (inputs are local). */
export function inputDate(at: Date): string {
  return format(at, 'yyyy-MM-dd');
}

/** "2h 15m" */
export function durationSince(from: Date, now: Date = new Date()): string {
  const ms = now.getTime() - from.getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return minutes === 0 ? 'just now' : `${minutes}m`;
  return `${hours}h ${minutes % 60}m`;
}

export function lateLabel(minutesLate: number | undefined): string {
  if (!minutesLate) return '';
  if (minutesLate >= 60) {
    return `Late ${Math.floor(minutesLate / 60)}h ${minutesLate % 60}m`;
  }
  return `Late ${minutesLate}m`;
}

/** A cosine similarity as a readable percentage, or an em dash. */
export function similarityLabel(similarity: number | null | undefined): string {
  if (similarity === null || similarity === undefined) return '—';
  return `${(similarity * 100).toFixed(1)}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
