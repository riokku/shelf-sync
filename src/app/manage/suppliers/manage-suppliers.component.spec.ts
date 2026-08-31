import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ManageSuppliersComponent } from './manage-suppliers.component';
import { SupplierService } from '../../core/supplier.service';
import { NotificationService } from '../../core/notification.service';
import { SupplierFormModalComponent } from '../../shared/components/supplier-form-modal/supplier-form-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { createFakeActivatedRoute, createFakeSupplierService } from '../../testing/fakes';
import { Supplier } from '../../shared/models/supplier.model';

function createTestSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'supplier-1',
    name: 'Gatherwell Event Furniture Co.',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    notes: '',
    ...overrides,
  };
}

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('ManageSuppliersComponent', () => {
  let component: ManageSuppliersComponent;
  let fixture: ComponentFixture<ManageSuppliersComponent>;

  async function setup(suppliers: Supplier[] = [], loadError: string | null = null) {
    await TestBed.configureTestingModule({
      imports: [ManageSuppliersComponent],
      providers: [
        provideRouter([]),
        { provide: SupplierService, useValue: createFakeSupplierService(suppliers, loadError) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageSuppliersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('shows the empty state when the org has no suppliers yet', async () => {
    await setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No suppliers yet');
  });

  it('shows an error state with a Retry button instead of the empty state when the load failed', async () => {
    await setup([], 'Network error');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Couldn\'t load suppliers. Network error');
    expect(fixture.nativeElement.textContent).not.toContain('No suppliers yet');
  });

  it('retryLoad() re-runs supplierService.load()', async () => {
    await setup([], 'Network error');
    const loadSpy = spyOn(TestBed.inject(SupplierService), 'load').and.resolveTo();

    component.retryLoad();

    expect(loadSpy).toHaveBeenCalled();
  });

  it('renders a row for each supplier in the directory', async () => {
    await setup([
      createTestSupplier({ id: 'supplier-1', name: 'Gatherwell Event Furniture Co.' }),
      createTestSupplier({ id: 'supplier-2', name: 'Linen & Lace Event Textiles' })
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Gatherwell Event Furniture Co.');
    expect(text).toContain('Linen & Lace Event Textiles');
  });

  it('addSupplier() opens the form modal with no supplier and toasts on a truthy close', async () => {
    await setup();
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
    const notification = TestBed.inject(NotificationService);
    const successSpy = spyOn(notification, 'success');

    component.addSupplier();

    expect(openSpy).toHaveBeenCalledWith(SupplierFormModalComponent, jasmine.objectContaining({ data: {} }));
    expect(successSpy).toHaveBeenCalledWith('Supplier added');
  });

  it('editSupplier() opens the form modal with the given supplier and toasts "updated"', async () => {
    await setup();
    const supplier = createTestSupplier();
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
    const notification = TestBed.inject(NotificationService);
    const successSpy = spyOn(notification, 'success');

    component.editSupplier(supplier);

    expect(openSpy).toHaveBeenCalledWith(SupplierFormModalComponent, jasmine.objectContaining({ data: { supplier } }));
    expect(successSpy).toHaveBeenCalledWith('Supplier updated');
  });

  it('does not toast when the form modal is dismissed without saving', async () => {
    await setup();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));
    const notification = TestBed.inject(NotificationService);
    const successSpy = spyOn(notification, 'success');

    component.addSupplier();

    expect(successSpy).not.toHaveBeenCalled();
  });

  it('removeSupplier() asks for confirmation, then removes the supplier and toasts on success', async () => {
    await setup();
    const supplier = createTestSupplier();
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
    const removeSpy = spyOn(TestBed.inject(SupplierService), 'remove').and.resolveTo(null);
    const notification = TestBed.inject(NotificationService);
    const successSpy = spyOn(notification, 'success');

    component.removeSupplier(supplier);
    await fixture.whenStable();

    expect(openSpy).toHaveBeenCalledWith(ConfirmDialogComponent, jasmine.anything());
    expect(removeSpy).toHaveBeenCalledWith('supplier-1');
    expect(successSpy).toHaveBeenCalledWith('Supplier removed');
  });

  it('does not remove anything when the confirmation is declined', async () => {
    await setup();
    const supplier = createTestSupplier();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));
    const removeSpy = spyOn(TestBed.inject(SupplierService), 'remove');

    component.removeSupplier(supplier);
    await fixture.whenStable();

    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('shows an inline error rather than a toast when removal fails', async () => {
    await setup();
    const supplier = createTestSupplier();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
    spyOn(TestBed.inject(SupplierService), 'remove').and.resolveTo('Something went wrong');

    component.removeSupplier(supplier);
    await fixture.whenStable();

    expect(component.removeError).toBe('Something went wrong');
  });
});

describe('ManageSuppliersComponent ?highlight= deep link (landed on from the command palette\'s "Suppliers" result)', () => {
  function configure(highlight: string, suppliers: Supplier[]) {
    TestBed.configureTestingModule({
      imports: [ManageSuppliersComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ highlight }) },
        { provide: SupplierService, useValue: createFakeSupplierService(suppliers) }
      ]
    });
    return TestBed.createComponent(ManageSuppliersComponent);
  }

  it('flashes the matching supplier once the directory has loaded', fakeAsync(() => {
    const fixture = configure('supplier-1', [createTestSupplier({ id: 'supplier-1' })]);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.isFlashing('supplier-1')).toBeTrue();
  }));

  it('is a no-op when ?highlight= doesn\'t match any supplier in the directory', fakeAsync(() => {
    const fixture = configure('missing', []);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.isFlashing('missing')).toBeFalse();
  }));
});
