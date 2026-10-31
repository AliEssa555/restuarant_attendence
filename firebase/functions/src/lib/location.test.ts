import { describe, expect, it } from 'vitest';
import { assertLocation, haversine } from './location';
import { DEFAULT_SETTINGS, LOCATION_MAX_AGE_MS } from '../config';
const now = new Date('2026-10-31T08:00:00Z');
const settings = {...DEFAULT_SETTINGS, locationLat:24.8607, locationLng:67.0011};
const coords = {lat:settings.locationLat, lng:settings.locationLng, accuracy:10, isMockLocation:false, timestampMs:now.getTime()};
function rejects(gps: typeof coords | undefined, code: string) {
  expect(() => assertLocation(gps, settings, now)).toThrow(expect.objectContaining({details:{code}}));
}
describe('location gate', () => {
  it('accepts a fresh fix at the restaurant', () => expect(assertLocation(coords,settings,now)).toBe(0));
  it('requires evidence', () => rejects(undefined,'LOCATION_REQUIRED'));
  it('rejects fake GPS before other quality checks', () => rejects({...coords,isMockLocation:true,accuracy:500},'LOCATION_MOCK'));
  it('rejects distant fixes', () => rejects({...coords,lat:coords.lat+0.01},'LOCATION_OUT_OF_RANGE'));
  it('rejects inaccurate fixes', () => rejects({...coords,accuracy:151},'LOCATION_ACCURACY_LOW'));
  it('accepts the accuracy boundary', () => expect(assertLocation({...coords,accuracy:150},settings,now)).toBe(0));
  it('rejects stale fixes', () => rejects({...coords,timestampMs:now.getTime()-LOCATION_MAX_AGE_MS-1},'LOCATION_STALE'));
  it('accepts the freshness boundary', () => expect(assertLocation({...coords,timestampMs:now.getTime()-LOCATION_MAX_AGE_MS},settings,now)).toBe(0));
  it('rejects future timestamps', () => rejects({...coords,timestampMs:now.getTime()+1},'LOCATION_STALE'));
  it('disabling the fence allows omitted or mock evidence', () => {
    expect(assertLocation(undefined,{...settings,requireLocation:false},now)).toBe(0);
    expect(assertLocation({...coords,isMockLocation:true},{...settings,requireLocation:false},now)).toBe(0);
  });
  it('calculates distance across the date line', () => expect(haversine(0,179.999,0,-179.999)).toBeCloseTo(222.39,1));
  it('rejects non-finite coordinates', () => rejects({...coords,lat:NaN},'LOCATION_OUT_OF_RANGE'));
});
