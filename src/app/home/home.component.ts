import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { HeroCratesSceneComponent } from './hero-crates-scene/hero-crates-scene.component';
import { needsRestockAttention } from '../shared/utils/inventory-stock';
import { getTodayIsoDate } from '../shared/utils/date';

interface GettingStartedStep {
  icon: string;
  label: string;
  description: string;
  routerLink: string;
  done: boolean;
}

interface HomeTaskSummary {
  id: string;
  title: string;
  dueDate: string | null;
}

interface HomeCheckedOutItemSummary {
  id: string;
  name: string;
}

interface HomeReservationSummary {
  id: string;
  itemId: string;
  itemName: string;
  startDate: string;
  endDate: string;
  quantity: number;
  reservedFor: string;
}

/** How many entries each personal list card shows before collapsing the
 *  rest into a "+N more" link to the full page — see loadPersonalStats()'s
 *  own doc comment. */
const HOME_LIST_VISIBLE_CAP = 4;

@Component({
  selector: 'app-home',
  imports: [RouterModule, MatIconModule, MatButtonModule, MatProgressBarModule, DatePipe, BreadcrumbsComponent, HeroCratesSceneComponent],
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

  /** A small personal "what's on your plate" section — shown to every
   *  signed-in user regardless of role, unlike the admin/manager-only
   *  Getting Started card below: everyone can have tasks assigned to them,
   *  something checked out, or a reservation they placed themselves (see
   *  the recent widening of manage/reservations to every approved org
   *  member). Each list is scoped to the signed-in user specifically
   *  (assigned_to/checked_out_to/reserved_by = auth.uid()), not org-wide —
   *  a different kind of data than restockCount/pendingManageCount above,
   *  which are already org-wide facts anyone/any-manager needs to see
   *  regardless of who's looking. Sits below the nav-card grid rather than
   *  above it — the cards are still the primary "where do I go" decision,
   *  this is supplementary detail once that's been taken in. */
  outstandingTasks: HomeTaskSummary[] = [];
  checkedOutItems: HomeCheckedOutItemSummary[] = [];
  upcomingReservations: HomeReservationSummary[] = [];

  get visibleOutstandingTasks(): HomeTaskSummary[] {
    return this.outstandingTasks.slice(0, HOME_LIST_VISIBLE_CAP);
  }
  get outstandingTasksOverflowCount(): number {
    return Math.max(0, this.outstandingTasks.length - HOME_LIST_VISIBLE_CAP);
  }

  get visibleCheckedOutItems(): HomeCheckedOutItemSummary[] {
    return this.checkedOutItems.slice(0, HOME_LIST_VISIBLE_CAP);
  }
  get checkedOutItemsOverflowCount(): number {
    return Math.max(0, this.checkedOutItems.length - HOME_LIST_VISIBLE_CAP);
  }

  get visibleUpcomingReservations(): HomeReservationSummary[] {
    return this.upcomingReservations.slice(0, HOME_LIST_VISIBLE_CAP);
  }
  get upcomingReservationsOverflowCount(): number {
    return Math.max(0, this.upcomingReservations.length - HOME_LIST_VISIBLE_CAP);
  }

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

  /** Backs the progress bar next to gettingStartedCompleteCount's own text
   *  above it — guarded against a 0-length steps array (only possible
   *  fleetingly before loadGettingStarted() populates it, since
   *  showGettingStarted already keeps the card itself hidden until
   *  gettingStartedReady) rather than assuming exactly 3 steps forever. */
  get gettingStartedProgressPercent(): number {
    if (this.gettingStartedSteps.length === 0) {
      return 0;
    }
    return (this.gettingStartedCompleteCount / this.gettingStartedSteps.length) * 100;
  }

  async ngOnInit() {
    const [{ data }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('quantity_remaining, low_quantity_threshold')
        .neq('status', 'retired'),
      this.loadGettingStarted(),
      this.loadPersonalStats()
    ]);

    this.restockCount = (data ?? []).filter(needsRestockAttention).length;
  }

  /** The personal "what's on your plate" section's three lists — see
   *  outstandingTasks' own doc comment for why these are user-scoped rather
   *  than org-wide. Skipped entirely (all three stay empty) for a
   *  signed-out/not-yet-resolved session, same as loadGettingStarted()'s
   *  own guard. Fetches full rows rather than a head:true count — unlike a
   *  bare stat tile, each card lists its own entries (task title, item
   *  name, reservation details), so the actual rows are needed regardless;
   *  a personal list is small enough that fetching all of it and capping
   *  display client-side (see HOME_LIST_VISIBLE_CAP) is simpler than a
   *  separate count query plus a limited one. */
  private async loadPersonalStats() {
    const session = await this.authService.getSession();
    if (!session) {
      return;
    }
    const userId = session.user.id;

    const [{ data: tasks }, { data: checkedOutItems }, { data: reservations }] = await Promise.all([
      this.supabase
        .from('tasks')
        .select('id, title, due_date')
        .eq('assigned_to', userId)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false }),
      this.supabase
        .from('inventory_items')
        .select('id, name')
        .eq('checked_out_to', userId)
        .order('name'),
      this.supabase
        .from('inventory_item_reservations')
        .select('id, item_id, start_date, end_date, quantity, reserved_for')
        .eq('reserved_by', userId)
        .in('status', ['reserved', 'picked_up'])
        .gte('end_date', getTodayIsoDate())
        .order('start_date', { ascending: true })
    ]);

    this.outstandingTasks = (tasks ?? []).map(task => ({ id: task.id, title: task.title, dueDate: task.due_date }));
    this.checkedOutItems = (checkedOutItems ?? []).map(item => ({ id: item.id, name: item.name }));

    const reservationRows = reservations ?? [];
    // A second small lookup rather than a PostgREST embedded-resource
    // select — this app doesn't use those anywhere (see e.g.
    // inventory-item-orders.ts's own identical id->name map convention).
    const itemIds = [...new Set(reservationRows.map(row => row.item_id))];
    const itemNamesById = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: items } = await this.supabase.from('inventory_items').select('id, name').in('id', itemIds);
      for (const item of items ?? []) {
        itemNamesById.set(item.id, item.name);
      }
    }
    this.upcomingReservations = reservationRows.map(row => ({
      id: row.id,
      itemId: row.item_id,
      itemName: itemNamesById.get(row.item_id) ?? 'Unknown item',
      startDate: row.start_date,
      endDate: row.end_date,
      quantity: row.quantity,
      reservedFor: row.reserved_for
    }));
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
