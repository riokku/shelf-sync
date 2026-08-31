/** Case-insensitive, whitespace-trimmed name match — shared by the CSV
 *  importer's duplicate-row check (shared/utils/inventory-import.ts) and
 *  the manual "Create item" form's own duplicate check
 *  (ManageInventoryComponent.submitInventoryItem()), so "an item with this
 *  name already exists" means the same thing and uses the same wording
 *  regardless of which path someone used to create it. */
export function isDuplicateItemName(name: string, existingNames: string[]): boolean {
  const normalized = name.trim().toLowerCase();
  return existingNames.some(existing => existing.trim().toLowerCase() === normalized);
}

export const DUPLICATE_ITEM_NAME_ERROR = 'An item with this name already exists';
