import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  type Functions,
} from 'firebase/functions';
import {
  getStorage,
  connectStorageEmulator,
  type FirebaseStorage,
} from 'firebase/storage';

/**
 * Client-side Firebase only.
 *
 * The portal holds no secrets: Vercel gets `NEXT_PUBLIC_FIREBASE_*` config,
 * which is public by design, and `firebase-admin` is deliberately not a
 * dependency. Every privileged action goes through a callable, where the server
 * checks the caller's claims.
 */

export const FUNCTIONS_REGION =
  process.env.NEXT_PUBLIC_FUNCTIONS_REGION ?? 'asia-south1';

const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
const EMULATOR_HOST = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? '127.0.0.1';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cached: {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
} | null = null;

/**
 * Initialise once, lazily, and wire up the emulators on first use.
 *
 * Lazy because Next.js renders these modules on the server during the build,
 * where there is no window and no emulator to connect to.
 */
function services() {
  if (cached) return cached;

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const fns = getFunctions(app, FUNCTIONS_REGION);
  const storage = getStorage(app);

  if (USE_EMULATORS && typeof window !== 'undefined') {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    connectFunctionsEmulator(fns, EMULATOR_HOST, 5001);
    connectStorageEmulator(storage, EMULATOR_HOST, 9199);
  }

  cached = { app, auth, db, functions: fns, storage };
  return cached;
}

export const firebaseAuth = () => services().auth;
export const firestore = () => services().db;
export const firebaseFunctions = () => services().functions;
export const firebaseStorage = () => services().storage;

/** True when the required public config is missing — surfaced on the login page. */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
}
