/**
 * Cloud Functions entry point.
 *
 * `./lib/admin` must come first: it initialises the Admin SDK before any
 * handler can touch Firestore.
 */
import './lib/admin';

export { createRestaurant } from './callables/createRestaurant';
export { createEmployee } from './callables/createEmployee';
export { createStaff } from './callables/createStaff';
export { setEmployeeActive } from './callables/setEmployeeActive';
export { submitFaceEnrolment, reviewFaceEnrolment } from './callables/faceEnrolment';
export { recordAttendance } from './callables/recordAttendance';
export { reviewAttendance } from './callables/reviewAttendance';
export { getMarkerPayload, rotateMarker } from './callables/marker';
