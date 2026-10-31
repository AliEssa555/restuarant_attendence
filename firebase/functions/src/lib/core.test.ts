import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { buildMarkerPayload, decodeMarker } from './marker';
import { cosineSimilarity, validateEmbedding } from './embedding';
import { decideStatus } from './decide';
import { computeLateness, toLocalDate } from './time';
import { isPathUnder } from './storage';

describe('restored backend helpers', () => {
  it('validates unit embeddings and rejects invalid shapes', () => {
    const unit = Array(128).fill(0); unit[0] = 1;
    expect(validateEmbedding(unit).ok).toBe(true);
    expect(validateEmbedding([...unit,0]).ok).toBe(false);
    expect(validateEmbedding(Array(128).fill(1)).ok).toBe(false);
    expect(validateEmbedding(Array(128).fill(NaN)).ok).toBe(false);
    expect(cosineSimilarity(unit,unit)).toBe(1);
  });
  it('keeps storage paths inside the employee directory', () => {
    expect(isPathUnder('faces/r/e/photo.jpg','faces/r/e/')).toBe(true);
    for (const path of ['faces/r/e2/photo.jpg','faces/r/e/../other.jpg','faces/r/e/'])
      expect(isPathUnder(path,'faces/r/e/')).toBe(false);
  });
  it('uses restaurant local dates and grace boundaries', () => {
    expect(toLocalDate(new Date('2026-10-30T20:00:00Z'),'Asia/Karachi')).toBe('2026-10-31');
    expect(computeLateness(new Date('2026-10-31T04:10:00Z'),'Asia/Karachi','09:00',10)).toEqual({late:false,minutesLate:10});
    expect(computeLateness(new Date('2026-10-31T04:11:00Z'),'Asia/Karachi','09:00',10)).toEqual({late:true,minutesLate:11});
  });
  it('decodes the configured marker and refuses rotated secrets', async () => {
    const marker={rid:'r1',markerVersion:1,markerSecret:'a-secret'};
    const bytes=await QRCode.toBuffer(buildMarkerPayload(marker),{type:'png',width:600});
    expect(await decodeMarker(bytes,marker)).toEqual({found:true,valid:true});
    expect(await decodeMarker(bytes,{...marker,markerSecret:'rotated'})).toEqual({found:true,valid:false});
  });
  const evidence={method:'face' as const,requireMarker:true,markerFound:true,markerValid:true,faceStatus:'approved' as const,
    enrolledModelVersion:'v1',submittedModelVersion:'v1',embeddingValid:true,facesDetected:1,similarity:0.8,verifyThreshold:0.75,reviewThreshold:0.6};
  it('uses verified, review and rejection bands', () => {
    expect(decideStatus(evidence).status).toBe('verified');
    expect(decideStatus({...evidence,similarity:0.65}).status).toBe('pending_review');
    expect(decideStatus({...evidence,similarity:0.5}).rejectReason).toBe('FACE_MISMATCH');
    expect(decideStatus({...evidence,method:'manual',markerFound:false}).status).toBe('verified');
  });
  it.each([
    [{markerFound:false},'MARKER_NOT_FOUND'], [{markerValid:false},'MARKER_INVALID'],
    [{faceStatus:'none' as const},'FACE_NOT_ENROLLED'], [{submittedModelVersion:'v2'},'FACE_MODEL_MISMATCH'],
    [{facesDetected:0},'NO_FACE'], [{facesDetected:2},'MULTIPLE_FACES'], [{embeddingValid:false},'EMBEDDING_INVALID'],
  ])('refuses bad face evidence %j', (patch,reason) => expect(decideStatus({...evidence,...patch}).rejectReason).toBe(reason));
});
