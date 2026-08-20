import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
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
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, BreadcrumbsComponent, UserAvatarComponent, EmptyStateComponent],
  templateUrl: './manage-activity.component.html',
  styleUrl: './manage-activity.component.scss',
})
export class ManageActivityComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  private profiles: Profile[] = [];
  entries: OrgActivityLogEntry[] = [];
  isLoading = true;

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

  private async loadEntries() {
    this.isLoading = true;

    const from = this.selectedDate;
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    this.entries = await loadActivityLog(this.supabase, this.profiles, {
      from: from.toISOString(),
      to: to.toISOString()
    });

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
