import { createHash, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { MARKER_PREFIX } from '../config';
interface Marker { rid: string; markerVersion: number; markerSecret: string }
export interface MarkerResult { found: boolean; valid: boolean }
export const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const buildMarkerPayload = (m: Marker) => `${MARKER_PREFIX}|${m.rid}|${m.markerVersion}|${m.markerSecret}`;
export async function decodeMarker(bytes: Buffer, expected: Marker): Promise<MarkerResult> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({width:1600, withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'attemptBoth' });
  if (!qr) return {found:false, valid:false};
  const actual = Buffer.from(qr.data); const target = Buffer.from(buildMarkerPayload(expected));
  return { found:true, valid: actual.length === target.length && timingSafeEqual(actual, target) };
}
