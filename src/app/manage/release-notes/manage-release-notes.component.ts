import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ReleaseNote, RELEASE_NOTE_SEVERITY_LABELS } from '../../shared/models/release-note.model';
import { loadReleaseNotes } from '../../shared/utils/release-notes';
import { markChangelogSeen } from '../../shared/utils/changelog';

/** "What's new" moved off the Help page onto its own Manage-hub page —
 *  admin/manager-only for now (`manageGuard`, same as every other
 *  `manage/*` route) since the Manage hub is the only place it's linked
 *  from; a natural future extension is surfacing it to every role once it
 *  has a home outside that hub. Read-only — entries are written from
 *  Studio's own `studio/release-notes` (StudioReleaseNotesComponent, full
 *  CRUD, platform-admin-gated) since this is genuinely global content, not
 *  any one org's own; see the add_release_notes migration's own doc
 *  comment. Both pages read the same platform-wide `release_notes` table
 *  via `loadReleaseNotes()` (shared/utils/release-notes.ts), which built an
 *  unseen-count badge on top of the list (`getUnseenChangelogCount()`/
 *  `markChangelogSeen()`, both `localStorage`-backed and per-user like
 *  `PageIntroComponent`'s own dismissal, not per-organization) — the very
 *  first time this is ever checked for a user with no stored value at all,
 *  it bootstraps them as caught-up-as-of-now rather than surfacing every
 *  entry that ever shipped before they first looked, the same way a
 *  freshly-connected email inbox doesn't retroactively mark years of old
 *  mail unread. `ManageComponent` badges this count on its own Release
 *  Notes card, same treatment its Inventory/Tasks/Team cards already give
 *  their own pending-request counts even though this isn't an approval
 *  queue. Visiting this page (or Studio's) is what actually clears it. */
@Component({
  selector: 'app-manage-release-notes',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './manage-release-notes.component.html',
  styleUrl: './manage-release-notes.component.scss',
})
export class ManageReleaseNotesComponent implements OnInit {
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;

  readonly severityLabels = RELEASE_NOTE_SEVERITY_LABELS;

  isLoading = true;
  /** Repeat-count for the loading-state skeleton rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];
  /** Set when loadReleaseNoteList()'s own query fails — see
   *  InventoryComponent's identical loadError field for the full reasoning.
   *  Genuinely possible now that this is a real DB fetch, unlike the
   *  static CHANGELOG_ENTRIES array this page used to read directly. */
  loadError: string | null = null;

  releaseNotes: ReleaseNote[] = [];

  async ngOnInit() {
    await this.loadReleaseNoteList();
    this.isLoading = false;

    const session = await this.authService.getSession();
    if (session) {
      markChangelogSeen(session.user.id, this.releaseNotes[0]?.postedAt ?? null);
    }
  }

  /** Re-runs loadReleaseNoteList() after a failed load — the Retry button's
   *  handler (see the template's own loadError branch). */
  retryLoad() {
    void this.loadReleaseNoteList();
  }

  private async loadReleaseNoteList() {
    const { releaseNotes, error } = await loadReleaseNotes(this.supabase);
    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.releaseNotes = releaseNotes;
  }
}
