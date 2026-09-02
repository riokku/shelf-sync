// Client-side downscale/re-encode for inventory item photos, run just
// before upload (see uploadInventoryItemImages() in inventory-item-images.ts,
// the one choke point every photo upload in the app already goes through —
// the create form, the edit flow, both callers of it). Item photos are by
// far this app's biggest Supabase cost lever (see PricingComponent's own
// doc comment: storage *and* the repeated bandwidth/egress cost of browsing
// them), so shrinking what actually gets uploaded is a direct, ongoing cost
// reduction with no product-visible downside — a phone photo straight off a
// modern camera (4000px+, several MB) is far larger than this app's own
// image gallery/lightbox ever displays it at.
//
// Deliberately conservative rather than clever: resize to a fixed max
// dimension and re-encode as JPEG at a fixed quality, then keep whichever of
// (compressed, original) is actually smaller — never risk making an upload
// bigger than it already was. GIF and SVG are passed through untouched
// (animation and vector fidelity would be lost by rasterizing through a
// canvas), and any failure along the way (a corrupt file, a browser that
// can't decode it, canvas/toBlob throwing) falls back to the original file
// rather than blocking the upload over a compression nicety.

/** Longer edge, in CSS pixels — comfortably above anything this app's own
 *  image gallery/lightbox/QR-adjacent thumbnails ever render an item photo
 *  at, while still being far smaller than a typical modern phone photo. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

const PASSTHROUGH_TYPES = new Set(['image/gif', 'image/svg+xml']);

/** Returns a same-or-smaller File for upload — the original file untouched
 *  for a passthrough type or on any decode/encode failure, or a resized/
 *  re-encoded JPEG when that's actually smaller than the original. Never
 *  throws; a broken image is exactly the sort of file that should still be
 *  handed to the caller's own upload path (and its own error handling)
 *  rather than fail silently here. */
export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || PASSTHROUGH_TYPES.has(file.type)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width <= MAX_DIMENSION && bitmap.height <= MAX_DIMENSION && file.type === 'image/jpeg') {
        // Already a JPEG within bounds — re-encoding would only risk a
        // second lossy generation for no real size win.
        return file;
      }

      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob || blob.size >= file.size) {
        return file;
      }

      const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], newName, { type: 'image/jpeg', lastModified: file.lastModified });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
