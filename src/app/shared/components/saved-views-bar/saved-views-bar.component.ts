import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../core/auth.service';
import { SavedView, addSavedView, loadSavedViews, removeSavedView } from '../../utils/saved-views';

/** A page-agnostic "Saved views" row — a chip per saved filter/search/sort
 *  combo (click to re-apply, a small trailing × to delete) plus a "Save
 *  current view" control that names and stores whatever the host's current
 *  filter state happens to be right now. This component has no idea what
 *  shape a "view" actually is for any given page (InventoryComponent's is
 *  category/stock-level/physical-location/search/status; ManageTasksComponent's
 *  is assignee/status/due-before/search) — `TFilters` is deliberately opaque,
 *  a plain JSON-serializable object the host constructs and reads back via
 *  `currentFilters`/`(applyView)`, the same "dumb, host owns the actual
 *  meaning" shape BulkActionToolbarComponent already established for its own
 *  page-agnostic "N selected" chrome.
 *
 *  Self-contained persistence (unlike BulkActionToolbarComponent) — same
 *  reasoning PageIntroComponent already gives for owning its own
 *  localStorage read/write rather than making every host duplicate it: this
 *  is a personal, per-user, per-page preference with no privileged/shared
 *  data behind it, so there's no reason to route it through a shared
 *  service or make each host re-implement loadSavedViews()'s own storage
 *  key shape. Browser-local only, not synced across devices — same
 *  documented tradeoff PageIntroComponent's own dismissal state and
 *  HomeComponent's Getting-Started dismissal already accept, for the same
 *  reason: cheap, no schema change, and the worst case (a different device
 *  just doesn't have this saved view yet) is mild. */
@Component({
  selector: 'app-saved-views-bar',
  // FormsModule alongside ReactiveFormsModule is deliberate, not a stray
  // import — the name field below is a bare <form (ngSubmit)="confirmSave()">
  // with a per-field [formControl] rather than a [formGroup] on the <form>
  // itself, and NgForm (which is what actually listens for the native
  // submit event, calls preventDefault(), and emits ngSubmit) only comes
  // from FormsModule. Without it, strictTemplates compiles clean and
  // clicking Save silently falls through to a real native form submission
  // (a page reload) instead — a real, previously-shipped bug in this exact
  // shape elsewhere in this app (see LockUserAccountModalComponent's own
  // history), caught here before it could repeat.
  imports: [MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule, FormsModule, ReactiveFormsModule],
  templateUrl: './saved-views-bar.component.html',
  styleUrl: './saved-views-bar.component.scss',
})
export class SavedViewsBarComponent<TFilters> implements OnInit {
  private authService = inject(AuthService);

  /** A short, unique-per-page id (e.g. 'inventory', 'manage-tasks') — part
   *  of the storage key, same role PageIntroComponent's own `pageKey`
   *  input already plays for that component's dismissal state. */
  @Input({ required: true }) pageKey = '';
  /** The host's own current filter/sort/etc. state, as a plain object — a
   *  getter-backed template binding (see InventoryComponent's/
   *  ManageTasksComponent's own `captureXFilters()` methods) that
   *  recomputes on every access rather than being cached, same "plain
   *  getter, cheap enough" convention this app's other filtered-list
   *  getters already use (see e.g. ReservationCalendarComponent's own
   *  `weeks` getter comment). The value actually persisted on Save is
   *  whatever this is at the moment Save is clicked. */
  @Input({ required: true }) currentFilters!: TFilters;
  /** Whether the host's *current* filters differ from that page's own
   *  do-nothing default (Inventory's `hasActiveFilters`, Manage Tasks'
   *  `hasActiveTaskFilters` — both already existed to drive each page's own
   *  "Clear filters" button, so this just reuses them rather than this
   *  component trying to work out "empty" from an opaque TFilters itself,
   *  which it has no way to do generically). Gates "Save current view" —
   *  saving the untouched default as a named view isn't useful, it's
   *  exactly what you already see with no view applied at all. */
  @Input({ required: true }) hasActiveFilters = false;
  /** Emits a saved view's own stored filters object when its chip is
   *  clicked — the host is what knows how to spread that back onto its own
   *  individual filter fields; this component never touches them itself. */
  @Output() applyView = new EventEmitter<TFilters>();

  @ViewChild('nameInput') private nameInput?: ElementRef<HTMLInputElement>;

  views: SavedView<TFilters>[] = [];
  isNaming = false;
  duplicateNameError = false;
  nameControl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(40)] });

  ngOnInit() {
    this.views = loadSavedViews<TFilters>(this.userId, this.pageKey);
  }

  private get userId(): string {
    return this.authService.session()?.user.id ?? 'unknown';
  }

  /** Compared as JSON rather than by reference — the host rebuilds
   *  `currentFilters` fresh on every template evaluation, so reference
   *  equality would never match even right after applying a view. */
  isActive(view: SavedView<TFilters>): boolean {
    return JSON.stringify(view.filters) === JSON.stringify(this.currentFilters);
  }

  startNaming() {
    if (!this.hasActiveFilters) {
      return;
    }
    this.nameControl.setValue('');
    this.duplicateNameError = false;
    this.isNaming = true;
    // The input doesn't exist until the @if above renders it — deferred one
    // tick, same pattern this app's other "focus something that only just
    // appeared" spots already use (see e.g. AppComponent's own
    // focusPageHeading()).
    setTimeout(() => this.nameInput?.nativeElement.focus());
  }

  cancelNaming() {
    this.isNaming = false;
  }

  confirmSave() {
    const name = this.nameControl.value.trim();
    if (!name) {
      return;
    }
    if (this.views.some(view => view.name.toLowerCase() === name.toLowerCase())) {
      this.duplicateNameError = true;
      return;
    }
    this.views = addSavedView(this.userId, this.pageKey, name, this.currentFilters);
    this.isNaming = false;
  }

  removeView(view: SavedView<TFilters>) {
    this.views = removeSavedView<TFilters>(this.userId, this.pageKey, view.id);
  }
}
