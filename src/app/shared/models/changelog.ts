/** One shipped feature worth telling a returning user about — shown on the
 *  Help page's "What's new" section (see `shared/utils/changelog.ts` for
 *  the unseen-count/badge logic built on top of this list). Hand-maintained
 *  alongside CLAUDE.md's own running log of shipped features — `date` is
 *  the date it actually shipped (see git history), used both for display
 *  and to compute how many entries a given user hasn't seen yet, so new
 *  entries must always be inserted at the front (newest first) with a date
 *  later than everything already here. */
export interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: '2026-08-31',
    title: 'Studio > Users shows recent signups',
    description: 'No more starting from a blank page — Studio > Users now lists the 20 most recent signups by default, with search still narrowing it down to someone specific.'
  },
  {
    date: '2026-08-31',
    title: 'Date-range filtering on Reports',
    description: 'Manage > Reports\' stock movement and task throughput sections can now be scoped to the last 7/30/90 days, all time, or a custom range.'
  },
  {
    date: '2026-08-31',
    title: 'Command palette (Ctrl/Cmd+K)',
    description: 'Jump to any page or search inventory, tasks, reservations, audits, broadcasts, suppliers, orders, team members, and (for platform admins) organizations and users — all from one search box, by name or id.'
  },
  {
    date: '2026-08-31',
    title: 'Org detail shows inventory & task counts',
    description: 'Studio > Organizations now shows each org\'s item/task/storage usage right in the list, and its per-org detail page shows the same numbers alongside members and recent activity.'
  },
  {
    date: '2026-08-30',
    title: 'Physical inventory audits',
    description: 'A new Manage > Audits page lets you reconcile physical stock counts against the system — start an audit, anyone can submit counts, and admins/managers apply the discrepancies.'
  },
  {
    date: '2026-08-30',
    title: 'Smarter Save button on tasks',
    description: 'Opening a task\'s Status dropdown no longer leaves Save clickable until you actually change something.'
  },
  {
    date: '2026-08-30',
    title: 'Bulk inventory import',
    description: 'Manage > Inventory now has an Import button next to Export — download a CSV template, fill in a row per item in Excel or Sheets, and re-upload to create them all at once.'
  },
  {
    date: '2026-08-28',
    title: 'Fewer silent failures',
    description: 'Home, Billing, and Studio now show a "couldn\'t load, try again" message with a Retry button if a page fails to load, instead of just looking empty.'
  },
  {
    date: '2026-08-28',
    title: 'Platform account locking',
    description: 'Studio > Users now opens a full page for each person, with a toggle to lock their account across every organization — for abuse, not org-level issues.'
  },
  {
    date: '2026-08-28',
    title: 'No more bare loading spinners',
    description: 'The last page still showing a plain spinner while it loads (the "awaiting approval" screen) now shows a shimmering placeholder instead, matching every other page in the app.'
  },
  {
    date: '2026-08-28',
    title: 'Broadcasts',
    description: 'Admins and managers can now post org-wide announcements, optionally referencing team members or inventory items. Everyone gets notified and can catch up on the new Broadcasts page.'
  },
  {
    date: '2026-08-28',
    title: 'Quicker way back to Home',
    description: 'Inventory, Tasks, Manage, Reservations, Help, Account, and Studio all show a Back button now, right above the page title.'
  },
  {
    date: '2026-08-28',
    title: 'Bolder page headers',
    description: 'Inventory, Tasks, and the Manage hub now open with a bold gradient header showing live counts at a glance, and every Manage page picked up a splash of matching color.'
  },
  {
    date: '2026-08-25',
    title: 'First-run page guidance',
    description: 'Inventory, Tasks, and the Manage hub now show a one-time, dismissible orientation hint the first time you visit.'
  },
  {
    date: '2026-08-25',
    title: 'In-app Help & FAQ page',
    description: 'This page! Answers to common "how do I..." questions about ShelfSync, linked from the header.'
  },
  {
    date: '2026-08-25',
    title: 'Contextual help tooltips',
    description: 'Small "?" icons now explain a handful of non-obvious controls, like container tracking and reservations, right where you need them.'
  },
  {
    date: '2026-08-24',
    title: 'Reservations',
    description: 'Book a quantity of an item for a future date range without checking it out, from the new Manage > Reservations page.'
  },
  {
    date: '2026-08-24',
    title: 'Retry failed data loads',
    description: 'Inventory, Tasks, and a few Manage pages now show a Retry button instead of an empty list when a page fails to load.'
  },
  {
    date: '2026-08-24',
    title: 'In-app notification center',
    description: 'A new bell icon in the header keeps a running list of task assignments, transfer offers, and approval requests.'
  },
  {
    date: '2026-08-24',
    title: 'Bulk actions on retirement requests',
    description: 'Approve or decline multiple pending retirement requests at once from Manage > Inventory\'s Requests tab.'
  },
  {
    date: '2026-08-24',
    title: 'Unsaved-changes protection',
    description: 'Manage > Inventory and Manage > Tasks now warn you before losing an in-progress, unsaved item or task.'
  }
];
