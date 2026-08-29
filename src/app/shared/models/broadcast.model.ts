/** One posted announcement (see the add_broadcasts migration's own doc
 *  comment for the full mechanism: admin/manager-authored, fanned out to
 *  every approved org member as a notification, optionally referencing
 *  specific team members and/or inventory items) — camelCased for client
 *  use, same "plain interface, not the generated snake_case DB row type"
 *  treatment this app's other client-facing shapes (InventoryItem, Supplier)
 *  already get. Backs /broadcasts (BroadcastsComponent). */
export interface Broadcast {
  id: string;
  title: string;
  message: string;
  /** Null once the author's own profile has been removed — see the
   *  migration's own doc comment on created_by's `on delete set null`. An
   *  orphaned broadcast this way is permanently uneditable/undeletable by
   *  anyone (nobody's auth.uid() ever matches null), which the page
   *  reflects by simply not showing Edit/Delete for it. */
  createdById: string | null;
  createdByLabel: string;
  createdByAvatarKey: string | null;
  createdAt: string;
  updatedAt: string;
  /** updatedAt !== createdAt — backs the page's own "Edited" indicator. */
  isEdited: boolean;
  referencedMembers: BroadcastReferencedMember[];
  referencedItems: BroadcastReferencedItem[];
}

export interface BroadcastReferencedMember {
  id: string;
  name: string;
  avatarKey: string | null;
}

export interface BroadcastReferencedItem {
  id: string;
  name: string;
}
