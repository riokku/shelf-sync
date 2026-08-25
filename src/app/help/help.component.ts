import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { CHANGELOG_ENTRIES } from '../shared/models/changelog';
import { markChangelogSeen } from '../shared/utils/changelog';

/** A static, always-available in-app reference for "how do I..." questions
 *  about ShelfSync itself — distinct from `/privacy`/`/terms` (legal
 *  documents, unguarded, own top-bar layout meant for a signed-out visitor)
 *  in the same way `/pricing` differs from this: this is about *using the
 *  product*, which only makes sense once signed in, so it lives inside the
 *  normal authenticated shell (header/footer chrome, `approvedGuard`) like
 *  Account/Tasks rather than alongside the legal pages. Content is grouped
 *  into `mat-accordion` sections (same component Manage > Team's own
 *  "Current team" list already uses) rather than a data-driven array, since
 *  this is static prose that never changes at runtime — plain markup is the
 *  more direct way to write and read it, same reasoning
 *  Privacy/TermsComponent's own static HTML content already follows.
 *
 *  Also owns the "What's new" section at the top (CHANGELOG_ENTRIES) —
 *  visiting this page is what marks every current entry seen
 *  (markChangelogSeen()), clearing HeaderComponent's own unseen-count badge
 *  on the "Help" nav link. */
@Component({
  selector: 'app-help',
  imports: [RouterLink, DatePipe, MatExpansionModule, MatIconModule, BreadcrumbsComponent],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
})
export class HelpComponent implements OnInit {
  private authService = inject(AuthService);

  readonly changelogEntries = CHANGELOG_ENTRIES;

  async ngOnInit() {
    const session = await this.authService.getSession();
    if (session) {
      markChangelogSeen(session.user.id);
    }
  }
}
