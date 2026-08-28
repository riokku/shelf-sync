import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ActivityEntityType, OrgActivityLogEntry, loadActivityLog } from '../../shared/utils/activity-log';

// Same icons the Manage hub cards already use for these entities
// (manage.component.html) — keeps the feed visually consistent with where
// each event type "lives" elsewhere in the app.
const ENTITY_ICONS: Record<ActivityEntityType, string> = {
  inventory_item: 'inventory_2',
  task: 'checklist',
  member: 'group'
};

@Component({
  selector: 'app-manage-activity',
  imports: [DatePipe, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, UserAvatarComponent, EmptyStateComponent],
  templateUrl: './manage-activity.component.html',
  styleUrl: './manage-activity.component.scss',
})
export class ManageActivityComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  private profiles: Profile[] = [];
  entries: OrgActivityLogEntry[] = [];
  isLoading = true;
  /** Repeat-count for the loading-state skeleton rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4, 5];
  /** Set when loadEntries()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Unlike that field's
   *  usual "leave what's already loaded in place" background-refresh
   *  behavior, a failed day-navigation reload here does clear entries —
   *  loadEntries() already swaps the whole list out for a spinner on every
   *  nav (isLoading), so there's no "stale but visible" list to preserve;
   *  showing the error state cleanly instead of a leftover previous day's
   *  entries is less confusing. */
  loadError: string | null = null;

  /** Local midnight for the day currently shown — defaults to today. Day
   *  navigation (prev/next) below just adds/subtracts a day and reloads. */
  selectedDate = this.startOfDay(new Date());

  get isToday(): boolean {
    return this.selectedDate.getTime() === this.startOfDay(new Date()).getTime();
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  async ngOnInit() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.profiles = data ?? [];
    await this.loadEntries();
  }

  /** Re-runs loadEntries() after a failed load — the Retry button's handler
   *  (see the template's own loadError branch). */
  retryLoad() {
    void this.loadEntries();
  }

  private async loadEntries() {
    this.isLoading = true;

    const from = this.selectedDate;
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    const { entries, error } = await loadActivityLog(this.supabase, this.profiles, {
      from: from.toISOString(),
      to: to.toISOString()
    });

    if (error) {
      this.loadError = error;
      this.entries = [];
      this.isLoading = false;
      return;
    }
    this.loadError = null;
    this.entries = entries;
    this.isLoading = false;
  }

  previousDay() {
    this.selectedDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate() - 1);
    this.loadEntries();
  }

  nextDay() {
    if (this.isToday) {
      return;
    }
    this.selectedDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate() + 1);
    this.loadEntries();
  }

  entityIcon(entityType: ActivityEntityType): string {
    return ENTITY_ICONS[entityType];
  }
}
