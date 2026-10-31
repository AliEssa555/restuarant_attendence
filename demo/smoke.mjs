// Run against the isolated demo emulators after seed:local. Never targets cloud.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const localFetch = (url, options = {}) => fetch(url, {...options, signal: AbortSignal.timeout(15000)});
const project = 'demo-restaurant-attendance';
const functionOrigin = process.env.DEMO_FUNCTIONS_ORIGIN ?? 'http://127.0.0.1:5001';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(functionOrigin));
const docBase = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
async function login(email) {
  const response = await localFetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-api-key', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'demo1234',returnSecureToken:true}),
  });
  const data=await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data.idToken;
}
async function call(token, name, data) {
  const response=await localFetch(`${functionOrigin}/${project}/asia-south1/${name}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data}),
  });
  const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result.result;
}
async function read(token,path) {
  const response=await localFetch(`${docBase}/${path}`,{headers:{Authorization:`Bearer ${token}`}});
  assert.ok(response.ok,await response.clone().text());return response.json();
}
assert.equal((await localFetch('http://127.0.0.1:9099/emulator/v1/projects/demo-restaurant-attendance/config')).status, 200);
const owner=await login('owner@demo.test');
const employee=await login('employee@demo.test');
if (process.argv.includes('--verify-persistence')) {
  const state = JSON.parse(readFileSync(process.env.DEMO_SMOKE_STATE, 'utf8'));
  const saved = await read(owner, `restaurants/local_demo_restaurant/attendance/${state.recordId}`);
  assert.equal(saved.fields.status.stringValue, 'verified');
  console.log('PASS: accounts and attendance survived container recreation.');
  process.exit(0);
}
const path='restaurants/local_demo_restaurant';
const original=await read(owner,path);
assert.equal(original.fields.settings.mapValue.fields.attendanceMode.stringValue,'manual');
assert.equal(original.fields.settings.mapValue.fields.requireLocation.booleanValue,true);
async function settings(fields) {
  const response=await localFetch(`${docBase}/${path}?updateMask.fieldPaths=settings`,{method:'PATCH',
    headers:{Authorization:`Bearer ${owner}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{settings:{mapValue:{fields}}}}),
  });assert.ok(response.ok,await response.clone().text());
}
try {
  await settings({...original.fields.settings.mapValue.fields,locationLat:{doubleValue:24.86},locationLng:{doubleValue:67.01}});
  const gps={lat:24.86,lng:67.01,accuracy:10,isMockLocation:false,timestampMs:Date.now()};
  const key=`smoke-${Date.now()}`;
  const input={type:'check_in',method:'manual',clientRequestId:key,gpsCoords:gps};
  const checked=await call(employee,'recordAttendance',input);assert.equal(checked.status,'verified');
  const duplicate=await call(employee,'recordAttendance',input);assert.equal(duplicate.duplicate,true);
  await call(employee,'recordAttendance',{...input,type:'check_out',clientRequestId:`${key}-out`});
  const rejected=await call(employee,'recordAttendance',{...input,clientRequestId:`${key}-mock`,gpsCoords:{...gps,isMockLocation:true}});
  assert.equal(rejected.rejectReason,'LOCATION_MOCK');
  const record=await read(owner,`${path}/attendance/${rejected.recordId}`);
  assert.equal(record.fields.gps.mapValue.fields.isMock.booleanValue,true);
  const presence=await read(owner,`${path}/employees/demo-employee`);
  assert.equal(presence.fields.presence.mapValue.fields.status.stringValue,'out');
  if (process.env.DEMO_SMOKE_STATE) writeFileSync(process.env.DEMO_SMOKE_STATE, JSON.stringify({recordId:checked.recordId}));
  console.log('PASS: demo logins, GPS check-in/out, idempotency, persisted mock rejection, unchanged rejected presence.');
} finally { await settings(original.fields.settings.mapValue.fields); }
