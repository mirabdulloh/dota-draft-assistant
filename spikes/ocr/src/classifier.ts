import sharp from 'sharp';

export type FeatureKind = 'rgb' | 'gray';

export type FeatureSpec = {
  grid: number;
  kind: FeatureKind;
};

/**
 * Downscale to a fixed grid, then zero-mean / unit-variance per channel.
 * The normalization is what buys tolerance to monitor brightness, contrast and
 * gamma differences; the small grid is what buys tolerance to blur and JPEG.
 */
export async function features(img: Buffer, spec: FeatureSpec): Promise<Float32Array> {
  const { grid, kind } = spec;
  const channels = kind === 'rgb' ? 3 : 1;

  let pipeline = sharp(img).flatten({ background: '#000000' }).resize(grid, grid, { fit: 'fill' });
  pipeline = kind === 'rgb' ? pipeline.toColorspace('srgb') : pipeline.grayscale();

  const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  const n = grid * grid;
  const out = new Float32Array(n * channels);
  // sharp emits 3 channels for srgb and 1 for grayscale after .raw()
  const stride = data.length / n;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < channels; c++) out[i * channels + c] = data[i * stride + c];
  }

  for (let c = 0; c < channels; c++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out[i * channels + c];
    mean /= n;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const d = out[i * channels + c] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / n) || 1;
    for (let i = 0; i < n; i++) out[i * channels + c] = (out[i * channels + c] - mean) / std;
  }
  return out;
}

function distance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

export type Reference = { id: number; slug: string; vec: Float32Array };

export type Match = {
  id: number;
  slug: string;
  /** Ratio of best to second-best distance. Near 1.0 means the match is ambiguous. */
  margin: number;
};

export function classify(query: Float32Array, refs: Reference[]): Match {
  let best = Infinity;
  let second = Infinity;
  let bestRef = refs[0];
  for (const ref of refs) {
    const d = distance(query, ref.vec);
    if (d < best) {
      second = best;
      best = d;
      bestRef = ref;
    } else if (d < second) {
      second = d;
    }
  }
  return {
    id: bestRef.id,
    slug: bestRef.slug,
    margin: second === 0 ? 1 : Math.sqrt(best / second),
  };
}
