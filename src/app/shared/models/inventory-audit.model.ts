/** A physical inventory audit ("cycle count") — reconciles what the system
 *  thinks is in stock against what's actually on the shelf. Started
 *  org-wide or scoped to one physicalLocation ('' means whole org, mirrors
 *  every other optional free-text field's empty-string-for-null convention
 *  in this app); totalItems/countedItems/discrepancyCount are computed
 *  client-side from this audit's own InventoryAuditCount rows (see
 *  shared/utils/inventory-audits.ts), not stored columns. */
export type InventoryAuditStatus = 'in_progress' | 'completed' | 'cancelled';

export interface InventoryAudit {
  id: string;
  status: InventoryAuditStatus;
  physicalLocation: string;
  note: string;
  startedByLabel: string;
  startedAt: string;
  completedByLabel: string;
  completedAt: string;
  cancelledByLabel: string;
  cancelledAt: string;
  totalItems: number;
  countedItems: number;
  discrepancyCount: number;
}

/** One item's snapshot within an audit — expectedQuantity is captured when
 *  the audit started (see start_inventory_audit()'s own migration comment
 *  for why this is a point-in-time snapshot, not re-read live), and stays
 *  fixed regardless of what else happens to the item afterward.
 *  countedQuantity is null until someone submits a count.
 *  isContainerTracked gates whether "Apply" is offered at all — a
 *  container-tracked item's discrepancy is informational only, see
 *  apply_audit_count()'s own migration comment. */
export interface InventoryAuditCount {
  id: string;
  itemId: string;
  itemName: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  countedByLabel: string;
  countedAt: string;
  note: string;
  appliedByLabel: string;
  appliedAt: string;
  isContainerTracked: boolean;
}

/** True once counted and not matching expected — the only rows "Apply"
 *  applies to (and only when also flat-tracked). A never-counted row
 *  (countedQuantity === null) is neither a match nor a discrepancy. */
export function isAuditDiscrepancy(count: InventoryAuditCount): boolean {
  return count.countedQuantity !== null && count.countedQuantity !== count.expectedQuantity;
}
