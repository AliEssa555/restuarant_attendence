import { randomBytes } from 'node:crypto';
export const generateMarkerSecret = () => randomBytes(32).toString('base64url');
