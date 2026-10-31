import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';
import { TEMP_PASSWORD_LENGTH } from '../config';
export async function createAuthAccount(email: string, displayName: string) {
  const tempPassword = randomBytes(TEMP_PASSWORD_LENGTH).toString('base64url').slice(0, TEMP_PASSWORD_LENGTH);
  try {
    const user = await getAuth().createUser({ email, displayName, password: tempPassword });
    return { uid: user.uid, tempPassword };
  } catch (error) {
    if ((error as {code?: string}).code === 'auth/email-already-exists')
      throw new HttpsError('already-exists', 'That email already has an account.');
    throw error;
  }
}
export async function rollbackAccount(uid: string) { await getAuth().deleteUser(uid); }
