import { getTodayIsoDate } from '../utils/date';

export const MAX_INVENTORY_ITEM_IMAGES = 10;

export interface ActivityLogEntry {
  timestamp: string;
  user: string;
  userAvatarKey: string | null;
  message: string;
  /** Server-computed (tag_activity_via_impersonation), never client-set —
   *  see OrgActivityLogEntry's own identical field for the full reasoning,
   *  shared verbatim by this table's own trigger. */
  viaImpersonation: boolean;
}

export function isLowStock(item: InventoryItem): boolean {
  return item.quantityRemaining < item.lowQuantityThreshold;
}

/** Out of stock is the more severe, more specific case of low stock (0 is
 *  always < a positive threshold) — badge rendering checks this first and
 *  falls back to isLowStock() so the two badges stay mutually exclusive.
 *  isLowStock() itself is left as-is since it also drives the item detail
 *  popup's warning banner text, which is still accurate at zero. */
export function isOutOfStock(item: InventoryItem): boolean {
  return item.quantityRemaining <= 0;
}

/** True once a checked-out item's own due-back date has passed — drives the
 *  "Overdue" badge/text treatment in ModalTableComponent and InventoryComponent
 *  (see their own doc comments), and is exactly what notify_overdue_checkouts()
 *  (see the add_inventory_item_checkout_due_date migration) checks server-side
 *  to decide who to email/notify. A plain ISO-date string comparison — both
 *  sides are 'YYYY-MM-DD', which sorts identically to a real date comparison
 *  — same shape checkedOutDueAt itself is stored/passed around in. Uses
 *  getTodayIsoDate() (shared/utils/date.ts) rather than
 *  new Date().toISOString(), which converts to UTC first and can report the
 *  wrong local day depending on the caller's timezone offset. */
export function isCheckoutOverdue(item: InventoryItem): boolean {
  return item.isCheckedOut && item.checkedOutDueAt !== '' && item.checkedOutDueAt < getTodayIsoDate();
}

export type InventoryItemStatus = 'active' | 'retirement_pending' | 'retired';

export class InventoryItem {
  id: string;
  name: string;
  barcode: string;
  description: string;
  image: string;
  images: string[];
  category: string;
  physicalLocation: string;
  digitalLocation: string;
  applicableYear: string;
  expirationDate: string;
  supplierName: string;
  supplierId: string | null;
  supplierLeadTime: string;
  orderLink: string;
  quantityTotal: number;
  quantityPerContainer: number;
  quantityAllocated: number;
  quantityRemaining: number;
  lowQuantityThreshold: number;
  pricePerUnit: number;
  pricePerContainer: number;
  isCheckedOut: boolean;
  checkedOutTo: string;
  checkedOutToId: string | null;
  checkedOutToAvatarKey: string | null;
  checkedOutDueAt: string;
  activityLog: ActivityLogEntry[];
  status: InventoryItemStatus;
  retirementRequestedById: string | null;
  retirementRequestedByLabel: string;
  retirementRequestNote: string;
  retirementRequestedAt: string;
  retiredByLabel: string;
  retiredAt: string;
  isLocked: boolean;
  lockedByLabel: string;
  lockedAt: string;

  constructor(
    id: string,
    name: string,
    barcode: string,
    description: string,
    image: string,
    images: string[],
    category: string,
    physicalLocation: string,
    digitalLocation: string,
    applicableYear: string,
    expirationDate: string,
    supplierName: string,
    supplierId: string | null,
    supplierLeadTime: string,
    orderLink: string,
    quantityTotal: number,
    quantityPerContainer: number,
    quantityAllocated: number,
    quantityRemaining: number,
    lowQuantityThreshold: number,
    pricePerUnit: number,
    pricePerContainer: number,
    isCheckedOut: boolean,
    checkedOutTo: string,
    checkedOutToId: string | null,
    checkedOutToAvatarKey: string | null,
    checkedOutDueAt: string,
    activityLog: ActivityLogEntry[],
    status: InventoryItemStatus,
    retirementRequestedById: string | null,
    retirementRequestedByLabel: string,
    retirementRequestNote: string,
    retirementRequestedAt: string,
    retiredByLabel: string,
    retiredAt: string,
    isLocked: boolean,
    lockedByLabel: string,
    lockedAt: string
  ) {
    //Tracking
    this.id = id;

    //Item information
    this.name = name;
    this.barcode = barcode;
    this.description = description;
    this.image = image;
    this.images = images;
    this.category = category;
    this.physicalLocation = physicalLocation;
    this.digitalLocation = digitalLocation;
    this.applicableYear = applicableYear;
    this.expirationDate = expirationDate;

    //Supplier information
    this.supplierName = supplierName;
    this.supplierId = supplierId;
    this.supplierLeadTime = supplierLeadTime;
    this.orderLink = orderLink;

    //Quantity information
    this.quantityTotal = quantityTotal;
    this.quantityPerContainer = quantityPerContainer;
    this.quantityAllocated = quantityAllocated;
    this.quantityRemaining = quantityRemaining;
    this.lowQuantityThreshold = lowQuantityThreshold;

    //Price information
    this.pricePerUnit = pricePerUnit;
    this.pricePerContainer = pricePerContainer;

    //Other information
    this.isCheckedOut = isCheckedOut;
    this.checkedOutTo = checkedOutTo;
    this.checkedOutToId = checkedOutToId;
    this.checkedOutToAvatarKey = checkedOutToAvatarKey;
    this.checkedOutDueAt = checkedOutDueAt;
    this.activityLog = activityLog;

    //Retirement information
    this.status = status;
    this.retirementRequestedById = retirementRequestedById;
    this.retirementRequestedByLabel = retirementRequestedByLabel;
    this.retirementRequestNote = retirementRequestNote;
    this.retirementRequestedAt = retirementRequestedAt;
    this.retiredByLabel = retiredByLabel;
    this.retiredAt = retiredAt;

    //Lock information
    this.isLocked = isLocked;
    this.lockedByLabel = lockedByLabel;
    this.lockedAt = lockedAt;
  }

}
