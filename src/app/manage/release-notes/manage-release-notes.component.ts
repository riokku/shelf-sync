import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CHANGELOG_ENTRIES } from '../../shared/models/changelog';
import { markChangelogSeen } from '../../shared/utils/changelog';

/** "What's new" moved off the Help page onto its own Manage-hub page —
 *  admin/manager-only for now (`manageGuard`, same as every other
 *  `manage/*` route) since the Manage hub is the only place it's linked
 *  from; a natural future extension is surfacing this to every role once
 *  it has a home outside the Manage hub. See CHANGELOG_ENTRIES' own doc
 *  comment for how entries are maintained, and shared/utils/changelog.ts
 *  for the unseen-count badge logic this page clears on visit. */
@Component({
  selector: 'app-manage-release-notes',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent],
  templateUrl: './manage-release-notes.component.html',
  styleUrl: './manage-release-notes.component.scss',
})
export class ManageReleaseNotesComponent implements OnInit {
  private authService = inject(AuthService);

  readonly changelogEntries = CHANGELOG_ENTRIES;

  async ngOnInit() {
    const session = await this.authService.getSession();
    if (session) {
      markChangelogSeen(session.user.id);
    }
  }
}
