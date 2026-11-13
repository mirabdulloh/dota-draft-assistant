import type { Snapshot } from './types.ts';

/**
 * Snapshot serialisation. Base64 rather than JSON number arrays because the
 * matrices are 16,129 floats each — as JSON that is megabytes of text and a
 * slow parse on a phone; as base64 it is a quarter of the size and decodes
 * into typed arrays directly.
 *
 * Hand-rolled rather than using Buffer or atob so the engine keeps zero
 * dependencies and runs unchanged in Node and React Native.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

function toBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

function fromBase64(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && s[len - 1] === '=') len--;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = LOOKUP[s.charCodeAt(i)];
    const b = LOOKUP[s.charCodeAt(i + 1)];
    const c = i + 2 < len ? LOOKUP[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? LOOKUP[s.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (p < bytes.length) bytes[p++] = (n >> 16) & 255;
    if (p < bytes.length) bytes[p++] = (n >> 8) & 255;
    if (p < bytes.length) bytes[p++] = n & 255;
  }
  return bytes;
}

const f32 = (a: Float32Array) => toBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const u8 = (a: Uint8Array) => toBase64(a);

function readF32(s: string): Float32Array {
  const bytes = fromBase64(s);
  return new Float32Array(bytes.buffer, 0, bytes.length >> 2);
}

export type SerialisedSnapshot = {
  version: 1;
  patch: string;
  bracket: number;
  builtAt: string;
  matchesUsed: number;
  k: number;
  heroIds: number[];
  baseline: string;
  pickRate: string;
  advantage: string;
  advConfidence: string;
  synergy: string;
  synConfidence: string;
  positionEligible?: string;
  positionWinRate?: string;
};

export function serialiseSnapshot(s: Snapshot): SerialisedSnapshot {
  return {
    version: 1,
    patch: s.patch,
    bracket: s.bracket,
    builtAt: s.builtAt,
    matchesUsed: s.matchesUsed,
    k: s.k,
    heroIds: s.heroIds,
    baseline: f32(s.baseline),
    pickRate: f32(s.pickRate),
    advantage: f32(s.advantage),
    advConfidence: f32(s.advConfidence),
    synergy: f32(s.synergy),
    synConfidence: f32(s.synConfidence),
    positionEligible: s.positionEligible ? u8(s.positionEligible) : undefined,
    positionWinRate: s.positionWinRate ? f32(s.positionWinRate) : undefined,
  };
}

export function deserialiseSnapshot(d: SerialisedSnapshot): Snapshot {
  if (d.version !== 1) throw new Error(`unsupported snapshot version ${d.version}`);
  return {
    patch: d.patch,
    bracket: d.bracket,
    builtAt: d.builtAt,
    matchesUsed: d.matchesUsed,
    k: d.k ?? 300,
    heroIds: d.heroIds,
    baseline: readF32(d.baseline),
    pickRate: readF32(d.pickRate),
    advantage: readF32(d.advantage),
    advConfidence: readF32(d.advConfidence),
    synergy: readF32(d.synergy),
    synConfidence: readF32(d.synConfidence),
    positionEligible: d.positionEligible ? fromBase64(d.positionEligible) : undefined,
    positionWinRate: d.positionWinRate ? readF32(d.positionWinRate) : undefined,
  };
}
