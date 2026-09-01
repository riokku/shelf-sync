/** One "What's new" entry — camelCased for client use, same "plain
 *  interface, not the generated snake_case DB row type" treatment this
 *  app's other client-facing shapes (Broadcast, Supplier) already get.
 *  Backs both `manage/release-notes` (read-only) and `studio/release-notes`
 *  (full CRUD) — see the add_release_notes migration's own doc comment for
 *  why this table is platform-wide rather than org-scoped, and
 *  shared/utils/release-notes.ts for the load/create/update/delete
 *  functions built on top of it. Replaces the previously hand-maintained
 *  `CHANGELOG_ENTRIES` array this file used to hold. */
export interface ReleaseNote {
  id: string;
  title: string;
  description: string;
  severity: ReleaseNoteSeverity;
  /** The date this entry should read as having shipped — independently
   *  editable from createdAt/updatedAt below, so a platform admin can
   *  backfill an older date or simply control display order without that
   *  being tied to whenever the row itself was actually inserted/edited. */
  postedAt: string;
  /** Null for every entry backfilled by the add_release_notes migration
   *  itself (no single real actor to attribute historical entries to), or
   *  once a platform admin who posted one is later removed. */
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 'standard' is the common case and renders with no special treatment —
 *  'emphasized' and 'critical' each get distinct styling (a colored left
 *  accent, a tinted background wash, and a small pill badge) so they stand
 *  out from the rest of the list. Deliberately reuses this app's existing
 *  app-warning-/app-danger- badge-pill CSS custom property pairs rather
 *  than inventing a third "highlight" color — the same amber-before-red
 *  escalation the app's own low-stock/out-of-stock status pills already
 *  use for "notable" vs. "urgent." */
export type ReleaseNoteSeverity = 'standard' | 'emphasized' | 'critical';

export interface ReleaseNoteSeverityOption {
  value: ReleaseNoteSeverity;
  label: string;
}

/** Order matters here — it's what ReleaseNoteFormModalComponent's own
 *  severity `mat-select` lists them in, least to most attention-grabbing. */
export const RELEASE_NOTE_SEVERITY_OPTIONS: ReleaseNoteSeverityOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'emphasized', label: 'Emphasized' },
  { value: 'critical', label: 'Critical' }
];

export const RELEASE_NOTE_SEVERITY_LABELS: Record<ReleaseNoteSeverity, string> = {
  standard: 'Standard',
  emphasized: 'Emphasized',
  critical: 'Critical'
};
