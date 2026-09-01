import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  ReleaseNoteFormModalComponent,
  ReleaseNoteFormModalData
} from '../../shared/components/release-note-form-modal/release-note-form-modal.component';
import { ReleaseNote, RELEASE_NOTE_SEVERITY_LABELS } from '../../shared/models/release-note.model';
import { deleteReleaseNote, loadReleaseNotes } from '../../shared/utils/release-notes';
import { markChangelogSeen } from '../../shared/utils/changelog';

/** Platform admins post/edit/delete "What's new" entries here — the CRUD
 *  counterpart to ManageReleaseNotesComponent's read-only list, both of
 *  which read the same platform-wide release_notes table (see the
 *  add_release_notes migration's own doc comment for why writes are
 *  Studio-only: this is genuinely global content, not any one org's own —
 *  so authorship belongs with the app's own maintainer, not org admins).
 *  Every write goes through release_notes' own plain RLS policies
 *  (is_platform_admin()) via shared/utils/release-notes.ts — no RPC needed,
 *  since nothing here has an atomic side effect on another table the way
 *  e.g. create_broadcast() does. No realtime subscription (unlike
 *  BroadcastsComponent, this page's closest sibling) — with a single
 *  platform-admin audience, "someone else changed this while I was looking"
 *  isn't a real scenario the way it is on a multi-editor page. */
@Component({
  selector: 'app-studio-release-notes',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './studio-release-notes.component.html',
  styleUrl: './studio-release-notes.component.scss',
})
export class StudioReleaseNotesComponent implements OnInit {
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);

  readonly severityLabels = RELEASE_NOTE_SEVERITY_LABELS;

  isLoading = true;
  /** Repeat-count for the loading-state skeleton rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];
  /** Set when loadReleaseNoteList()'s own query fails — see
   *  InventoryComponent's identical loadError field for the full reasoning. */
  loadError: string | null = null;
  deleteError: string | null = null;

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

  private openReleaseNoteForm(releaseNote?: ReleaseNote) {
    const data: ReleaseNoteFormModalData = { releaseNote };
    const dialogRef = this.dialog.open(ReleaseNoteFormModalComponent, {
      data,
      width: 'clamp(28rem, 50vw, 36rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((saved: boolean | undefined) => {
      if (!saved) {
        return;
      }
      void this.loadReleaseNoteList();
      this.notification.success(releaseNote ? 'Release note updated' : 'Release note posted');
    });
  }

  newReleaseNote() {
    this.openReleaseNoteForm();
  }

  editReleaseNote(releaseNote: ReleaseNote) {
    this.openReleaseNoteForm(releaseNote);
  }

  removeReleaseNote(releaseNote: ReleaseNote) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete release note?',
        message: `Delete "${releaseNote.title}"? This can't be undone.`,
        confirmLabel: 'Delete',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (!confirmed) {
        return;
      }
      this.deleteError = null;
      const error = await deleteReleaseNote(this.supabase, releaseNote.id);
      if (error) {
        this.deleteError = error;
        return;
      }
      await this.loadReleaseNoteList();
      this.notification.success('Release note deleted');
    });
  }
}
