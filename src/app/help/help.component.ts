import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { HELP_FAQ_SECTIONS, HelpFaqSection } from '../shared/models/help-faq';

/** A static, always-available in-app reference for "how do I..." questions
 *  about ShelfSync itself — distinct from `/privacy`/`/terms` (legal
 *  documents, unguarded, own top-bar layout meant for a signed-out visitor)
 *  in the same way `/pricing` differs from this: this is about *using the
 *  product*, which only makes sense once signed in, so it lives inside the
 *  normal authenticated shell (header/footer chrome, `approvedGuard`) like
 *  Account/Tasks rather than alongside the legal pages.
 *
 *  Content lives in `HELP_FAQ_SECTIONS` (a plain data array, not inline
 *  markup the way Privacy/TermsComponent's own static prose is) specifically
 *  so `filteredSections` below can search it — searching a hand-written
 *  wall of `<mat-expansion-panel>` markup isn't practical, but filtering a
 *  plain array of question/answer objects is.
 *
 *  "What's new" used to live here too; it's now its own page
 *  (`manage/release-notes`) reachable from the Manage hub — see that
 *  component's own doc comment for why. */
@Component({
  selector: 'app-help',
  imports: [
    RouterLink, FormsModule, MatButtonModule, MatExpansionModule, MatFormFieldModule, MatIconModule, MatInputModule,
    BreadcrumbsComponent, EmptyStateComponent
  ],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
})
export class HelpComponent {
  searchTerm = '';

  clearSearch() {
    this.searchTerm = '';
  }

  /** Every section unfiltered while the search box is empty; otherwise
   *  only sections with at least one question or answer matching the
   *  term, each trimmed down to just its matching items — searching the
   *  answer text too (not just the question) means e.g. searching
   *  "reservation" also surfaces the order-received question, which
   *  mentions reservations only in passing but is still relevant. */
  get filteredSections(): HelpFaqSection[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      return HELP_FAQ_SECTIONS;
    }
    return HELP_FAQ_SECTIONS
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.question.toLowerCase().includes(term) || item.answer.toLowerCase().includes(term)
        )
      }))
      .filter(section => section.items.length > 0);
  }

  get hasNoResults(): boolean {
    return this.searchTerm.trim().length > 0 && this.filteredSections.length === 0;
  }
}
