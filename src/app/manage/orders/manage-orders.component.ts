import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { SupplierService } from '../../core/supplier.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { HelpTooltipComponent } from '../../shared/components/help-tooltip/help-tooltip.component';
import { PlaceOrderModalComponent, OrderableItem } from '../../shared/components/place-order-modal/place-order-modal.component';
import { InventoryItemOrderWithItem, loadAllInventoryItemOrders } from '../../shared/utils/inventory-item-orders';
import { resolveSupplierName } from '../../shared/utils/supplier-label';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { FlashTracker } from '../../shared/utils/flash-tracker';
import { flashAndScrollToHighlighted } from '../../shared/utils/highlight-row';
import { debounce } from '../../shared/utils/debounce';

type OrderStatusFilter = 'all' | 'ordered' | 'received' | 'cancelled';

/** manage/orders — org-wide view of every restock order placed against any
 *  item, plus the "Place order" entry point that picks an item from across
 *  the whole org rather than needing that item's own detail popup open
 *  first. Replaces the item-detail-popup "Orders" tab ModalTableComponent
 *  used to have — one central page for creating/reviewing/actioning orders
 *  instead of one scattered across however many items' popups have ever had
 *  one placed. Every order still appears in its own item's activity log
 *  (see PlaceOrderModalComponent/the receive/cancel RPCs), so that history
 *  isn't lost by centralizing the *workflow* here. manageGuard (admin/
 *  manager) — same audience placing/actioning an order already needs via
 *  inventory_item_orders' own RLS. */
@Component({
  selector: 'app-manage-orders',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    HelpTooltipComponent
  ],
  templateUrl: './manage-orders.component.html',
  styleUrl: './manage-orders.component.scss',
})
export class ManageOrdersComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private supplierService = inject(SupplierService);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);

  isLoading = true;
  isProcessingOrder = false;
  orderError: string | null = null;
  /** Repeat-count for the loading-state skeleton cards — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3];
  /** Set when loadOrders()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Only the orders
   *  query itself is checked, not the items/profiles/supplier lookups
   *  ngOnInit also runs alongside it — same "secondary loads stay
   *  unchecked" line ManageReservationsComponent's own loadError draws. */
  loadError: string | null = null;

  statusFilter: OrderStatusFilter = 'all';

  private allItems: { id: string; name: string; supplier_id: string | null }[] = [];
  private profiles: Profile[] = [];
  orders: InventoryItemOrderWithItem[] = [];

  // Which rows should currently show the brief "someone else just changed
  // this" pulse (see shared/utils/flash-tracker.ts) — read from the
  // template via isFlashing(order.id). Ids land here as raw
  // postgres_changes events come in (see ngOnInit's subscription below) and
  // get flashed once loadOrders()'s own debounced reload actually reflects
  // them — same shape ManageTasksComponent's own pendingFlashIds/
  // debouncedReloadTasks pair already establishes.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();
  private readonly debouncedReloadOrders = debounce(() => void this.reloadAndFlashChangedOrders(), 300);

  get filteredOrders(): InventoryItemOrderWithItem[] {
    if (this.statusFilter === 'all') {
      return this.orders;
    }
    return this.orders.filter(order => order.status === this.statusFilter);
  }

  /** Only items with a supplier already linked are orderable at all — an
   *  order needs to know who it's from, same reasoning ModalTableComponent's
   *  own canPlaceOrder getter used to gate the (now-removed) per-item
   *  Reorder button on. */
  get orderableItems(): OrderableItem[] {
    const suppliers = this.supplierService.suppliers();
    return this.allItems
      .filter((item): item is { id: string; name: string; supplier_id: string } => !!item.supplier_id)
      .map(item => ({
        id: item.id,
        name: item.name,
        supplierId: item.supplier_id,
        supplierName: resolveSupplierName(item.supplier_id, suppliers)
      }));
  }

  async ngOnInit() {
    const [{ data: items }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('id, name, supplier_id').order('name'),
      this.supabase.from('profiles').select('*').eq('organization_id', this.authService.organizationId()!).order('full_name'),
      this.supplierService.load()
    ]);

    this.allItems = items ?? [];
    this.profiles = profiles ?? [];
    await this.loadOrders();
    this.isLoading = false;

    // Landed here from the command palette's own "Orders" result (see
    // CommandPaletteService) — this page has no per-order deep link of its
    // own the way Inventory/Tasks/Audits do, so ?highlight= plus the
    // existing flashTracker/.realtime-flash pulse stands in for one.
    flashAndScrollToHighlighted(
      this.route.snapshot.queryParamMap.get('highlight'),
      this.orders.map(order => order.id),
      id => `order-${id}`,
      this.flashTracker
    );

    // Live updates from other users/tabs — marking an order received or
    // cancelled elsewhere shows up here without a manual reload. Reuses
    // loadOrders() itself (debounced), same "full reload rather than a
    // single-row patch" reasoning the task pages already use — this page
    // has no per-row cached shape worth patching in place the way
    // Inventory's own refreshInventoryListItem() does. No client-side
    // organization_id filter — see subscribeToTableChanges()'s own comment
    // for why RLS alone is the right boundary here.
    const channel = subscribeToTableChanges(this.supabase, 'inventory_item_orders', payload => {
      // DELETE isn't tracked — inventory_item_orders has no delete path in
      // this app, and there'd be no row left to flash once the reload below
      // completes anyway.
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadOrders();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadOrders.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(orderId: string): boolean {
    return this.flashTracker.isFlashing(orderId);
  }

  private async reloadAndFlashChangedOrders() {
    await this.loadOrders();
    for (const id of this.pendingFlashIds) {
      this.flashTracker.flash(id);
    }
    this.pendingFlashIds.clear();
  }

  /** Re-runs loadOrders() after a failed load — the Retry button's handler
   *  (see the template's own loadError branch). */
  retryLoad() {
    void this.loadOrders();
  }

  private async loadOrders() {
    const itemNamesById = new Map(this.allItems.map(item => [item.id, item.name]));
    const { orders, error } = await loadAllInventoryItemOrders(this.supabase, this.profiles, itemNamesById);
    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.orders = orders;
  }

  openPlaceOrder() {
    const dialogRef = this.dialog.open(PlaceOrderModalComponent, {
      data: { items: this.orderableItems },
      width: 'clamp(32rem, 55vw, 40rem)',
      maxWidth: '90vw'
    });

    // Split out from the subscribe callback itself (rather than an inline
    // async arrow) so a spec can call/await it directly instead of racing
    // afterClosed()'s synchronous-emission timing against an async callback.
    dialogRef.afterClosed().subscribe(saved => void this.handlePlaceOrderResult(saved));
  }

  private async handlePlaceOrderResult(saved: boolean | undefined) {
    if (!saved) {
      return;
    }
    await this.loadOrders();
    this.notification.success('Order placed');
  }

  async markReceived(order: InventoryItemOrderWithItem) {
    if (this.isProcessingOrder) {
      return;
    }
    this.isProcessingOrder = true;
    this.orderError = null;

    const { error } = await this.supabase.rpc('receive_inventory_item_order', { order_id: order.id });

    if (error) {
      this.isProcessingOrder = false;
      this.orderError = error.message;
      return;
    }

    await this.loadOrders();
    this.isProcessingOrder = false;
    this.notification.success('Order marked received');
  }

  async cancelOrder(order: InventoryItemOrderWithItem) {
    if (this.isProcessingOrder) {
      return;
    }
    this.isProcessingOrder = true;
    this.orderError = null;

    const { error } = await this.supabase.rpc('cancel_inventory_item_order', { order_id: order.id });

    if (error) {
      this.isProcessingOrder = false;
      this.orderError = error.message;
      return;
    }

    await this.loadOrders();
    this.isProcessingOrder = false;
    this.notification.success('Order cancelled');
  }
}
