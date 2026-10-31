/** Non-destructive bootstrap for the isolated Docker demo. */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
const projectId = 'demo-restaurant-attendance';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Local seed requires both emulator hosts; real Firebase is never supported.');
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();
const rid = 'local_demo_restaurant';
const restaurant = db.collection('restaurants').doc(rid);
if ((await restaurant.get()).exists) {
  console.log('Using saved demo data. Existing accounts, GPS settings and attendance retained.');
  process.exit(0);
}
const password = 'demo1234';
const profiles = [
  {uid:'demo-owner', email:'owner@demo.test', name:'Demo Owner', role:'owner'},
  {uid:'demo-manager', email:'manager@demo.test', name:'Demo Manager', role:'manager'},
  {uid:'demo-employee', email:'employee@demo.test', name:'Demo Employee', role:'employee', eid:'demo-employee'},
  {uid:'demo-chef', email:'chef@demo.test', name:'Demo Chef', role:'employee', eid:'demo-chef'},
];
const batch = db.batch();
for (const profile of profiles) {
  try { await auth.getUser(profile.uid); }
  catch (error) {
    if ((error as {code?:string}).code !== 'auth/user-not-found') throw error;
    await auth.createUser({uid:profile.uid,email:profile.email,password,displayName:profile.name});
  }
  await auth.setCustomUserClaims(profile.uid, {role:profile.role,rid,...(profile.eid ? {eid:profile.eid} : {})});
  batch.set(db.collection('users').doc(profile.uid), {
    role:profile.role,restaurantId:rid,displayName:profile.name,email:profile.email,
    mustChangePassword:false,...(profile.eid ? {employeeId:profile.eid} : {}),
  });
  if (profile.eid) {
    batch.set(restaurant.collection('employees').doc(profile.eid), {
      name:profile.name,email:profile.email,uid:profile.uid,active:true,position:profile.eid==='demo-chef'?'Chef':'Waiter',
      scheduledStart:'09:00',face:{status:'none'},presence:{status:'out'},createdAt:Timestamp.now(),
    });
    for (let day = 1; day <= 7; day++) {
      const date = new Date();date.setUTCDate(date.getUTCDate()-day);date.setUTCHours(6,0,0,0);
      for (const type of ['check_in','check_out']) {
        const at = Timestamp.fromDate(new Date(date.getTime()+(type==='check_out'?8*3600000:0)));
        batch.set(restaurant.collection('attendance').doc(`${profile.eid}-${day}-${type}`), {
          employeeId:profile.eid,employeeName:profile.name,type,method:'manual',status:'verified',
          createdAt:at,localDate:at.toDate().toISOString().slice(0,10),clientRequestId:`sample-${profile.eid}-${day}-${type}`,
          late:day%3===0,minutesLate:day%3===0?15:0,
          // Historical sample rows are intentionally distinct from live GPS evidence.
          device:{platform:'sample-data',appVersion:'demo'},
        });
      }
    }
  }
}
// Creating this last, in the same batch as all documents, marks seed completion.
batch.set(restaurant, {
  name:'Restaurant Location Demo',timezone:'Asia/Karachi',ownerUid:'demo-owner',createdAt:Timestamp.now(),
  settings:{attendanceMode:'manual',faceVerifyThreshold:0.75,faceReviewThreshold:0.6,requireMarker:false,
    lateGraceMinutes:10,requireLocation:true,locationLat:0,locationLng:0,locationRadiusMeters:200},
});
await batch.commit();
console.log('Created local location-only demo. Password for all demo accounts: demo1234');
