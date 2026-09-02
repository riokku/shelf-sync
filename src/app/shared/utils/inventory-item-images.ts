import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { compressImageFile } from './image-compression';

export const INVENTORY_IMAGES_BUCKET = 'inventory-images';

export interface InventoryItemImageRecord {
  id: string;
  storagePath: string;
  url: string;
  position: number;
}

export async function loadInventoryItemImageRecords(
  supabase: SupabaseClient<Database>,
  itemId: string
): Promise<InventoryItemImageRecord[]> {
  const { data } = await supabase
    .from('inventory_item_images')
    .select('*')
    .eq('item_id', itemId)
    .order('position');

  return (data ?? []).map(row => ({
    id: row.id,
    storagePath: row.storage_path,
    position: row.position,
    url: supabase.storage.from(INVENTORY_IMAGES_BUCKET).getPublicUrl(row.storage_path).data.publicUrl
  }));
}

export async function uploadInventoryItemImages(
  supabase: SupabaseClient<Database>,
  itemId: string,
  files: File[],
  startPosition: number
): Promise<string | null> {
  for (let i = 0; i < files.length; i++) {
    // Downscaled/re-encoded here, right before its own upload, rather than
    // all up front — a batch of up to MAX_INVENTORY_ITEM_IMAGES full-size
    // decoded bitmaps held in memory at once is unnecessary when each one
    // is only ever needed for the moment of its own upload. See
    // compressImageFile()'s own doc comment for why this exists at all —
    // item photos are this app's biggest Supabase storage/egress cost lever.
    const file = await compressImageFile(files[i]);
    const position = startPosition + i;
    const path = `${itemId}/${Date.now()}-${position}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from(INVENTORY_IMAGES_BUCKET).upload(path, file);
    if (uploadError) {
      return uploadError.message;
    }

    const { error: insertError } = await supabase.from('inventory_item_images').insert({
      item_id: itemId,
      storage_path: path,
      position
    });
    if (insertError) {
      return insertError.message;
    }
  }
  return null;
}

export async function deleteInventoryItemImage(
  supabase: SupabaseClient<Database>,
  image: { id: string; storagePath: string }
): Promise<string | null> {
  const { error: storageError } = await supabase.storage.from(INVENTORY_IMAGES_BUCKET).remove([image.storagePath]);
  if (storageError) {
    return storageError.message;
  }
  const { error: dbError } = await supabase.from('inventory_item_images').delete().eq('id', image.id);
  return dbError?.message ?? null;
}

export async function loadInventoryImagesByItemId(
  supabase: SupabaseClient<Database>,
  itemIds: string[]
): Promise<Map<string, string[]>> {
  const imagesByItemId = new Map<string, string[]>();
  if (itemIds.length === 0) {
    return imagesByItemId;
  }

  const { data } = await supabase
    .from('inventory_item_images')
    .select('*')
    .in('item_id', itemIds)
    .order('position');

  for (const image of data ?? []) {
    const { data: { publicUrl } } = supabase.storage.from(INVENTORY_IMAGES_BUCKET).getPublicUrl(image.storage_path);
    const existing = imagesByItemId.get(image.item_id) ?? [];
    existing.push(publicUrl);
    imagesByItemId.set(image.item_id, existing);
  }

  return imagesByItemId;
}
