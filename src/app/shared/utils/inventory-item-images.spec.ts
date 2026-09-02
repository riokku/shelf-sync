import { uploadInventoryItemImages } from './inventory-item-images';

/** A tiny real oversized image, same technique image-compression.spec.ts
 *  uses — this needs to genuinely decode via createImageBitmap() so
 *  compressImageFile() actually re-encodes it, rather than a fabricated
 *  byte array that would just fall back to the original untouched. */
async function makeOversizedImageFile(name = 'photo.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 2000;
  canvas.height = 2000;
  canvas.getContext('2d')!.fillRect(0, 0, 2000, 2000);
  const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

function createFakeSupabaseClient(uploadedFiles: File[]) {
  return {
    storage: {
      from: () => ({
        upload: (_path: string, file: File) => {
          uploadedFiles.push(file);
          return Promise.resolve({ error: null });
        }
      })
    },
    from: () => ({
      insert: () => Promise.resolve({ error: null })
    })
  } as unknown as import('@supabase/supabase-js').SupabaseClient<import('../models/database.types').Database>;
}

describe('uploadInventoryItemImages', () => {
  it('compresses each file before uploading it', async () => {
    const original = await makeOversizedImageFile();
    const uploadedFiles: File[] = [];
    const supabase = createFakeSupabaseClient(uploadedFiles);

    const error = await uploadInventoryItemImages(supabase, 'item-1', [original], 0);

    expect(error).toBeNull();
    expect(uploadedFiles.length).toBe(1);
    // Re-encoded to JPEG and smaller than the original 2000x2000 PNG — the
    // real, observable effect of routing through compressImageFile() first,
    // rather than uploading the file exactly as picked.
    expect(uploadedFiles[0].type).toBe('image/jpeg');
    expect(uploadedFiles[0].size).toBeLessThan(original.size);
  });
});
