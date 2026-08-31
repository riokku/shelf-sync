import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { SupplierService } from '../../core/supplier.service';
import { NotificationService } from '../../core/notification.service';
import { Supplier } from '../../shared/models/supplier.model';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SupplierFormModalComponent, SupplierFormModalData } from '../../shared/components/supplier-form-modal/supplier-form-modal.component';
import { FlashTracker } from '../../shared/utils/flash-tracker';
import { flashAndScrollToHighlighted } from '../../shared/utils/highlight-row';

/** manage/suppliers — admin/manager CRUD for the org's supplier directory
 *  (see the add_supplier_directory migration's own doc comment for why
 *  inventory_items.supplier_id links here instead of storing a free-text
 *  name). manageGuard, same admin-or-manager audience as manage/inventory,
 *  which this directory exists to serve — not adminGuard, since a manager
 *  can already edit an item's own supplier field, so curating the list they
 *  pick from shouldn't be admin-only either. */
@Component({
  selector: 'app-manage-suppliers',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-suppliers.component.html',
  styleUrl: './manage-suppliers.component.scss',
})
export class ManageSuppliersComponent implements OnInit {
  protected supplierService = inject(SupplierService);
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  isLoading = true;
  removeError: string | null = null;
  /** Repeat-count for the loading-state skeleton table rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];

  // This page has no realtime subscription of its own (unlike Orders/
  // Reservations/Broadcasts, which already had a FlashTracker for that) —
  // added purely to back the command palette's own "Suppliers" result (see
  // CommandPaletteService), the same ?highlight= + .realtime-flash landing
  // treatment those three pages already reuse for the same reason.
  private flashTracker = new FlashTracker();

  isFlashing(supplierId: string): boolean {
    return this.flashTracker.isFlashing(supplierId);
  }

  async ngOnInit() {
    await this.supplierService.load();
    this.isLoading = false;

    flashAndScrollToHighlighted(
      this.route.snapshot.queryParamMap.get('highlight'),
      this.supplierService.suppliers().map(supplier => supplier.id),
      id => `supplier-${id}`,
      this.flashTracker
    );
    this.destroyRef.onDestroy(() => this.flashTracker.clear());
  }

  /** The Retry button's handler once supplierService.loadError() is set —
   *  see InventoryComponent's identical retryLoad() for the full reasoning. */
  retryLoad() {
    void this.supplierService.load();
  }

  private openForm(data: SupplierFormModalData) {
    const dialogRef = this.dialog.open(SupplierFormModalComponent, {
      data,
      width: 'clamp(26rem, 45vw, 32rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((saved: boolean | undefined) => {
      if (saved) {
        this.notification.success(data.supplier ? 'Supplier updated' : 'Supplier added');
      }
    });
  }

  addSupplier() {
    this.openForm({});
  }

  editSupplier(supplier: Supplier) {
    this.openForm({ supplier });
  }

  removeSupplier(supplier: Supplier) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remove supplier?',
        message: `Remove "${supplier.name}" from your supplier directory? Items currently pointing at it will just show no supplier — this can't be undone.`,
        confirmLabel: 'Remove',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (!confirmed) {
        return;
      }
      this.removeError = null;
      const error = await this.supplierService.remove(supplier.id);
      if (error) {
        this.removeError = error;
        return;
      }
      this.notification.success('Supplier removed');
    });
  }
}
