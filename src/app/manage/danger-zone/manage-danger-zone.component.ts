import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';

const INVENTORY_IMAGES_BUCKET = 'inventory-images';

@Component({
  selector: 'app-manage-danger-zone',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, BreadcrumbsComponent],
  templateUrl: './manage-danger-zone.component.html',
  styleUrl: './manage-danger-zone.component.scss',
})
export class ManageDangerZoneComponent implements OnInit {
  protected authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);

  organizationId: string | null = null;
  organizationName: string | null = null;

  isExporting = false;
  exportError: string | null = null;

  isDeletingOrg = false;
  deleteError: string | null = null;

  async ngOnInit() {
    // getProfile() rather than the profile signal — same race the signal
    // has everywhere else (see AuthService.session/getSession() docs):
    // it's only populated once the constructor's async load resolves, which
    // may not have happened yet this early in ngOnInit.
    const profile = await this.authService.getProfile();
    this.organizationId = profile?.organization_id ?? null;
    if (this.organizationId) {
      const { data } = await this.supabase.from('organizations').select('name').eq('id', this.organizationId).single();
      this.organizationName = data?.name ?? null;
    }
  }

  /** Every query here relies on RLS to scope results to the caller's own
   *  organization (same convention the rest of the app uses, e.g.
   *  ManageTeamComponent's loadProfiles()) rather than adding explicit
   *  .eq('organization_id', ...) filters everywhere. */
  async exportOrganizationData() {
    if (this.isExporting) {
      return;
    }

    this.isExporting = true;
    this.exportError = null;

    const [
      { data: inventoryItems, error: itemsError },
      { data: inventoryImages },
      { data: inventoryActivity },
      { data: tasks, error: tasksError },
      { data: teamMembers, error: profilesError },
      { data: siteSettings },
      { data: fieldOptions }
    ] = await Promise.all([
      this.supabase.from('inventory_items').select('*'),
      this.supabase.from('inventory_item_images').select('*'),
      this.supabase.from('inventory_item_activity').select('*'),
      this.supabase.from('tasks').select('*'),
      this.supabase.from('profiles').select('*'),
      this.supabase.from('site_settings').select('*'),
      this.supabase.from('inventory_field_options').select('*')
    ]);

    this.isExporting = false;

    const error = itemsError ?? tasksError ?? profilesError;
    if (error) {
      this.exportError = error.message;
      return;
    }

    const inventoryImagesWithUrls = (inventoryImages ?? []).map(image => ({
      ...image,
      url: this.supabase.storage.from(INVENTORY_IMAGES_BUCKET).getPublicUrl(image.storage_path).data.publicUrl
    }));

    const bundle = {
      exportedAt: new Date().toISOString(),
      organization: this.organizationName,
      inventoryItems: inventoryItems ?? [],
      inventoryItemImages: inventoryImagesWithUrls,
      inventoryItemActivity: inventoryActivity ?? [],
      tasks: tasks ?? [],
      teamMembers: teamMembers ?? [],
      siteSettings: siteSettings ?? [],
      inventoryFieldOptions: fieldOptions ?? []
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shelfsync-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Soft delete only — sets deleted_at rather than removing any rows. The
   *  scheduled purge job (see the add_organization_deletion migration) does
   *  the real, permanent delete after a 30-day grace period. */
  async deleteOrganization() {
    if (this.isDeletingOrg || !this.organizationId || !this.organizationName) {
      return;
    }

    const typed = prompt(
      `This will delete "${this.organizationName}" and everything in it — inventory, tasks, and every team member's` +
      ` access — after a 30-day grace period, and you'll be signed out immediately.\n\n` +
      `Type the organization name to confirm: ${this.organizationName}`
    );
    if (typed !== this.organizationName) {
      return;
    }

    this.isDeletingOrg = true;
    this.deleteError = null;

    const { error } = await this.supabase
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', this.organizationId);

    if (error) {
      this.isDeletingOrg = false;
      this.deleteError = error.message;
      return;
    }

    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
