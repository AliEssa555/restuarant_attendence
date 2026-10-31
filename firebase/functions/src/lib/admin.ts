import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });
