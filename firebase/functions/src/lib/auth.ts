import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Role } from './types';
import { permissionDenied, unauthenticated } from './errors';
export const STAFF: Role[] = ['owner', 'manager'];
export const OWNER_ONLY: Role[] = ['owner'];
export const EMPLOYEE_ONLY: Role[] = ['employee'];
export function assertRole(request: CallableRequest, allowed: Role[]) {
  if (!request.auth) unauthenticated();
  const { uid, token } = request.auth;
  const role = token.role as Role;
  if (!allowed.includes(role) || typeof token.rid !== 'string' || !token.rid ||
      token.rid.includes('/') || (role === 'employee' &&
      (typeof token.eid !== 'string' || !token.eid || token.eid.includes('/')))) permissionDenied('Access denied.');
  return { uid, rid: token.rid as string, eid: token.eid as string | undefined, role };
}
