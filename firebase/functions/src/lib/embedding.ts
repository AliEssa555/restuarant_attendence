import { SUPPORTED_EMBEDDING_LENGTHS, EMBEDDING_NORM_TOLERANCE } from '../config';
export function validateEmbedding(v: number[], expectedLength?: number) {
  if (!Array.isArray(v) || !(expectedLength ? v.length === expectedLength : SUPPORTED_EMBEDDING_LENGTHS.includes(v.length))) return { ok: false, problem: 'length' };
  if (!v.every(Number.isFinite)) return { ok: false, problem: 'non-finite' };
  const norm = Math.sqrt(v.reduce((s, x) => s + x*x, 0));
  return Math.abs(norm - 1) <= EMBEDDING_NORM_TOLERANCE ? { ok: true } : { ok: false, problem: 'norm' };
}
export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? Math.max(-1, Math.min(1, a.reduce((s,x,i) => s + x*b[i],0) / norm)) : 0;
}
