import { compressImageFile } from './image-compression';

/** Builds a real File backed by an actual decodable image — a solid-color
 *  canvas, drawn and re-exported as either PNG or JPEG — rather than a
 *  fabricated byte array, so createImageBitmap() genuinely succeeds the
 *  same way it would against a real photo. Chrome (headless included, which
 *  is what this suite runs under) has a real canvas implementation, so no
 *  mocking is needed for any of this. */
async function makeImageFile(width: number, height: number, type: 'image/png' | 'image/jpeg' = 'image/png', name = 'photo.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3366aa';
  ctx.fillRect(0, 0, width, height);
  const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), type));
  return new File([blob], name, { type });
}

describe('compressImageFile', () => {
  it('downscales an oversized image to the max dimension and re-encodes it as JPEG', async () => {
    const original = await makeImageFile(3000, 2000, 'image/png', 'big.png');

    const result = await compressImageFile(original);

    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('big.jpg');
    const bitmap = await createImageBitmap(result);
    expect(Math.max(bitmap.width, bitmap.height)).toBeLessThanOrEqual(1600);
    expect(bitmap.width / bitmap.height).toBeCloseTo(3000 / 2000, 1);
    bitmap.close();
  });

  it('never returns a file larger than the original', async () => {
    // A small, already-simple image — a real photo's worth of detail would
    // usually shrink under re-encoding, but a tiny flat-color PNG might not,
    // which is exactly the case this guard exists for.
    const original = await makeImageFile(40, 40, 'image/png', 'tiny.png');

    const result = await compressImageFile(original);

    expect(result.size).toBeLessThanOrEqual(original.size);
  });

  it('passes an already-small in-bounds JPEG through unchanged', async () => {
    const original = await makeImageFile(200, 150, 'image/jpeg', 'small.jpg');

    const result = await compressImageFile(original);

    expect(result).toBe(original);
  });

  it('passes GIFs through untouched, to preserve animation', async () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'anim.gif', { type: 'image/gif' });

    const result = await compressImageFile(original);

    expect(result).toBe(original);
  });

  it('passes SVGs through untouched, to preserve vector fidelity', async () => {
    const original = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });

    const result = await compressImageFile(original);

    expect(result).toBe(original);
  });

  it('falls back to the original file if it cannot be decoded', async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4, 5])], 'corrupt.png', { type: 'image/png' });

    const result = await compressImageFile(original);

    expect(result).toBe(original);
  });

  it('passes through a non-image file unchanged', async () => {
    const original = new File(['not an image'], 'notes.txt', { type: 'text/plain' });

    const result = await compressImageFile(original);

    expect(result).toBe(original);
  });
});
