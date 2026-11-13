import sharp from 'sharp';

export type Conditions = {
  /** Rendered width in px, as the draft screen would show it. */
  width: number;
  /** Crop-window offset as a fraction of each dimension — locator imprecision. */
  offset?: number;
  /** Simulate a photographed monitor rather than a clean screenshot. */
  photo?: boolean;
};

/**
 * The offset crop is what keeps this from being a pure same-image comparison:
 * the locator will never hand us a pixel-perfect box, so the classifier has to
 * tolerate seeing a shifted, differently-framed window of the portrait.
 */
export function degrade(c: Conditions): (buf: Buffer) => Promise<Buffer> {
  return async (buf) => {
    let img = sharp(buf);

    if (c.offset && c.offset > 0) {
      const meta = await img.metadata();
      const W = meta.width!;
      const H = meta.height!;
      const dx = Math.round(W * c.offset);
      const dy = Math.round(H * c.offset);
      img = sharp(buf).extract({ left: dx, top: dy, width: W - dx, height: H - dy });
    }

    const scaled = await img.resize({ width: c.width, kernel: 'lanczos3' }).png().toBuffer();
    if (!c.photo) return scaled;

    const shot = await sharp(scaled)
      .blur(0.9)
      .modulate({ brightness: 0.85, saturation: 1.15 })
      .gamma(1.3)
      .jpeg({ quality: 55 })
      .toBuffer();
    return sharp(shot).png().toBuffer();
  };
}
