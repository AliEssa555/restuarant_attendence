import { REGION } from '../config';
export const CALL_OPTS = { region: REGION, maxInstances: 10 };
export const IMAGE_CALL_OPTS = { ...CALL_OPTS, memory: '512MiB' as const, timeoutSeconds: 60 };
