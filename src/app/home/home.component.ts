import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { needsRestockAttention } from '../shared/utils/inventory-stock';

interface GettingStartedStep {
  icon: string;
  label: string;
  description: string;
  routerLink: string;
  done: boolean;
}

@Component({
  selector: 'app-home',
  imports: [RouterModule, MatIconModule, MatButtonModule, BreadcrumbsComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  protected authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;

  get greetingName(): string {
    const profile = this.authService.profile();
    return profile?.nickname || profile?.full_name || '';
  }

  /** Same "needs restocking" fact HeaderComponent's Inventory nav badge
   *  shows, surfaced again here since this is the first thing a signed-in
   *  user sees — see inventory-stock.ts. needsRestockAttention() combines
   *  low *and* out-of-stock (and, incidentally, any pending-retirement item
   *  too, since retirement can only be requested at zero remaining) — named
   *  restockCount rather than lowStockCount, and the card's own label below
   *  reads "low or out of stock" rather than "low stock" (matching
   *  HeaderComponent's own nav-badge tooltip wording), so neither the field
   *  name nor the visible text implies a narrower "low stock only" count
   *  than what this actually is. Loaded independently rather than sharing
   *  state with HeaderComponent, matching how this app's other small count
   *  badges (pendingManageCount vs. ManageComponent's own) are already each
   *  self-sufficient rather than wired through a shared service, for a
   *  query this cheap. */
  restockCount = 0;

  /** Guards rendering the getting-started card until its own three counts
   *  have actually resolved — without this, a fully-set-up org would flash
   *  the card into view for a moment (every count defaults to "not done")
   *  before immediately hiding it once the real counts land. Only ever
   *  false→true, once, on initial load. */
  gettingStartedReady = false;
  /** Admin/manager-only (see gettingStartedSteps' own gating in the
   *  template) — org-wide setup progress, not a per-user one, since a
   *  brand-new org's *first* real action (adding an item, inviting a
   *  teammate, creating a task) can come from any admin/manager on the
   *  team, not necessarily whoever happens to be looking at this card. */
  gettingStartedSteps: GettingStartedStep[] = [];
  /** Per-viewer, not org-wide — see dismissGettingStarted()'s own comment
   *  for why this deliberately isn't a site_settings column. */
  gettingStartedDismissed = false;

  get showGettingStarted(): boolean {
    return this.gettingStartedReady
      && !this.gettingStartedDismissed
      && this.gettingStartedSteps.some(step => !step.done);
  }

  get gettingStartedCompleteCount(): number {
    return this.gettingStartedSteps.filter(step => step.done).length;
  }

  async ngOnInit() {
    const [{ data }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('quantity_remaining, low_quantity_threshold')
        .neq('status', 'retired'),
      this.loadGettingStarted()
    ]);

    this.restockCount = (data ?? []).filter(needsRestockAttention).length;
  }

  /** Loads the counts behind each getting-started step and this viewer's
   *  own dismissal preference — skipped entirely for a plain staff member,
   *  who can't act on any of these three steps (adding an item, inviting a
   *  teammate, and creating a task are all admin/manager-only) and so has
   *  no use for a card telling them to. */
  private async loadGettingStarted() {
    if (!this.authService.canManage()) {
      this.gettingStartedReady = true;
      return;
    }

    this.gettingStartedDismissed = this.readDismissed();

    const session = await this.authService.getSession();
    const [items, tasks, teammates] = await Promise.all([
      this.supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
      this.supabase.from('tasks').select('id', { count: 'exact', head: true }),
      session
        ? this.supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('id', session.user.id)
        : Promise.resolve({ count: 0 })
    ]);

    this.gettingStartedSteps = [
      {
        icon: 'inventory_2',
        label: 'Add your first inventory item',
        description: 'Track what you have, how much, and where it lives.',
        routerLink: '/manage/inventory',
        done: (items.count ?? 0) > 0
      },
      {
        icon: 'group_add',
        label: 'Invite your team',
        description: 'Share your invite link so teammates can join.',
        routerLink: '/manage/team',
        done: (teammates.count ?? 0) > 0
      },
      {
        icon: 'add_task',
        label: 'Create your first task',
        description: 'Assign work and track it through to done.',
        routerLink: '/manage/tasks',
        done: (tasks.count ?? 0) > 0
      }
    ];
    this.gettingStartedReady = true;
  }

  /** Per-viewer (localStorage), not an org-wide site_settings column —
   *  site_settings' own UPDATE policy is admin-only (see CLAUDE.md), so a
   *  manager could see and act on this card but couldn't dismiss it for
   *  everyone; keying it to the browser instead means anyone who can see
   *  the card can also dismiss it, at the (acceptable, low-stakes) cost of
   *  a different teammate/device seeing it again until they do too. Keyed
   *  by organization id defensively, though this app has no notion of one
   *  profile belonging to more than one org to actually collide on. */
  private dismissedStorageKey(): string {
    return `shelf-sync:getting-started-dismissed:${this.authService.organizationId() ?? 'unknown'}`;
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(this.dismissedStorageKey()) === '1';
    } catch {
      return false;
    }
  }

  dismissGettingStarted() {
    this.gettingStartedDismissed = true;
    try {
      localStorage.setItem(this.dismissedStorageKey(), '1');
    } catch {
      // Best-effort — worst case this card reappears next visit, no
      // different than a private-browsing session where it always would.
    }
  }
}
