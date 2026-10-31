import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ records: new Map<string, any>(), presence: 'out', settings: {} as any, gps: undefined as any }));
vi.mock('../lib/callable', () => ({IMAGE_CALL_OPTS:{}}));
vi.mock('../lib/auth', () => ({EMPLOYEE_ONLY:['employee'],assertRole:()=>({rid:'r1',eid:'e1',uid:'u1'})}));
vi.mock('../lib/time', () => ({getRestaurant:async()=>({settings:state.settings,timezone:'Asia/Karachi'}),toLocalDate:()=> '2026-10-31',computeLateness:()=>({late:false,minutesLate:0})}));
vi.mock('../lib/storage', () => ({assertFresh:vi.fn(),isPathUnder:()=>true,readUploadedPhoto:vi.fn()}));
vi.mock('../lib/marker', () => ({sha256Hex:(b:Buffer)=>b.toString('hex'),decodeMarker:vi.fn()}));
vi.mock('../lib/paths', () => {
  const employee = { get: async()=>({exists:true,data:()=>({active:true,name:'Ali',presence:{status:state.presence}})}) };
  function doc(id: string) {
    return {id, get:async()=>({exists:state.records.has(id),data:()=>state.records.get(id)}),firestore:{runTransaction:async(fn:any)=>fn({
      get:async(ref:any)=>ref.get(),
      create:(ref:any,record:any)=>{state.records.set(ref.id,record);},
      update:(_ref:any,patch:any)=>{state.presence=patch['presence.status'];},
      set:vi.fn(),
    })}};
  }
  function query(filters: [string,unknown][] = []): any { return {
    where:(key:string,_op:string,value:unknown)=>query([...filters,[key,value]]),orderBy:()=>query(filters),limit:()=>query(filters),
    get:async()=>{
      const docs=[...state.records].filter(([,v])=>filters.every(([k,x])=>v[k]===x)).map(([id,v])=>({id,data:()=>v}));
      return {empty:docs.length===0,docs};
    },doc,
  }; }
  return {employeeRef:()=>employee,attendanceRef:()=>query(),checkinPhotoPrefix:()=>'',markerRef:vi.fn(),photoHashRef:vi.fn()};
});
import { DEFAULT_SETTINGS } from '../config';
import { recordAttendance } from './recordAttendance';
const invoke = (gpsCoords?: unknown, key='request-0001') => recordAttendance.run({data:{type:'check_in',method:'manual',clientRequestId:key,gpsCoords}} as any);
beforeEach(()=>{
  state.records.clear();state.presence='out';state.settings={...DEFAULT_SETTINGS,locationLat:24.86,locationLng:67.01};
  state.gps={lat:24.86,lng:67.01,accuracy:10,isMockLocation:false,timestampMs:Date.now()};
});
describe('attendance location persistence',()=>{
  it('persists mock evidence on rejection and never moves presence',async()=>{
    const result=await invoke({...state.gps,isMockLocation:true});
    expect(result).toMatchObject({status:'rejected',rejectReason:'LOCATION_MOCK'});
    expect([...state.records.values()][0].gps).toMatchObject({isMock:true,distance:0});
    expect(state.presence).toBe('out');
  });
  it('persists missing-location rejection',async()=>{
    expect(await invoke()).toMatchObject({status:'rejected',rejectReason:'LOCATION_REQUIRED'});
    expect(state.records.size).toBe(1);expect(state.presence).toBe('out');
  });
  it('preserves the original verdict on retry with changed GPS',async()=>{
    await invoke({...state.gps,isMockLocation:true});
    expect(await invoke(state.gps)).toMatchObject({status:'rejected',rejectReason:'LOCATION_MOCK',duplicate:true});
    expect(state.records.size).toBe(1);
  });
  it('accepts inside-fence fixes and updates presence',async()=>{
    expect(await invoke(state.gps)).toMatchObject({status:'verified'});expect(state.presence).toBe('in');
  });
  it('returns success on retry even after presence changed',async()=>{
    await invoke(state.gps);
    expect(await invoke()).toMatchObject({status:'verified',duplicate:true});expect(state.records.size).toBe(1);
  });
  it('keeps optional mock evidence when fence is disabled',async()=>{
    state.settings.requireLocation=false;
    expect(await invoke({...state.gps,isMockLocation:true})).toMatchObject({status:'verified'});
    expect([...state.records.values()][0].gps.isMock).toBe(true);
  });
  it('does not return another employee record for a reused request key',async()=>{
    state.records.set('other',{employeeId:'other',clientRequestId:'request-0001',status:'verified'});
    expect(await invoke({...state.gps,isMockLocation:true})).toMatchObject({status:'rejected',duplicate:false});
  });
  it.each([
    [{accuracy:151},'LOCATION_ACCURACY_LOW'],
    [{lat:25},'LOCATION_OUT_OF_RANGE'],
    [{timestampMs:1},'LOCATION_STALE'],
  ])('persists failed location evidence %j',async(patch,code)=>{
    expect(await invoke({...state.gps,...patch})).toMatchObject({status:'rejected',rejectReason:code});
    expect(state.records.size).toBe(1);expect(state.presence).toBe('out');
  });
});
