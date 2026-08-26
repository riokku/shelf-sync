import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { SupplierService } from '../../core/supplier.service';
import { NotificationService } from '../../core/notification.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { HelpTooltipComponent } from '../../shared/components/help-tooltip/help-tooltip.component';
import { PlaceOrderModalComponent, OrderableItem } from '../../shared/components/place-order-modal/place-order-modal.component';
import { InventoryItemOrderWithItem, loadAllInventoryItemOrders } from '../../shared/utils/inventory-item-orders';
import { resolveSupplierName } from '../../shared/utils/supplier-label';

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
    MatProgressSpinnerModule,
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
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);

  isLoading = true;
  isProcessingOrder = false;
  orderError: string | null = null;

  statusFilter: OrderStatusFilter = 'all';

  private allItems: { id: string; name: string; supplier_id: string | null }[] = [];
  private profiles: Profile[] = [];
  orders: InventoryItemOrderWithItem[] = [];

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
      this.supabase.from('profiles').select('*').order('full_name'),
      this.supplierService.load()
    ]);

    this.allItems = items ?? [];
    this.profiles = profiles ?? [];
    await this.loadOrders();
    this.isLoading = false;
  }

  private async loadOrders() {
    const itemNamesById = new Map(this.allItems.map(item => [item.id, item.name]));
    this.orders = await loadAllInventoryItemOrders(this.supabase, this.profiles, itemNamesById);
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
