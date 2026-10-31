import { getStorage } from 'firebase-admin/storage';
import { MAX_PHOTO_BYTES } from '../config';
import { failedPrecondition, invalidArgument, REASON } from './errors';
export function isPathUnder(path: string, prefix: string) {
  return path.startsWith(prefix) && path.length > prefix.length && !path.split('/').some(p => p === '..' || p === '.' || !p);
}
export function assertFresh(uploadedAt: Date, now: Date, maxAge: number) {
  const age = now.getTime() - uploadedAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age > maxAge) failedPrecondition('Take a fresh photo.', {code: REASON.PHOTO_STALE});
}
export async function readUploadedPhoto(path: string) {
  const file = getStorage().bucket().file(path);
  const [metadata] = await file.getMetadata();
  if (metadata.contentType !== 'image/jpeg' || Number(metadata.size) > MAX_PHOTO_BYTES) invalidArgument('Upload a JPEG smaller than 3 MB.');
  const [bytes] = await file.download({ validation: 'crc32c' });
  if (bytes.length > MAX_PHOTO_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) invalidArgument('The photo is not a JPEG.');
  return { bytes, uploadedAt: new Date(metadata.timeCreated!) };
}
