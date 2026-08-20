import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ModalTableComponent } from './modal-table.component';
import { AuthService } from '../../../core/auth.service';
import { SupabaseService } from '../../../core/supabase.service';
import { createFakeAuthService, createFakeMatDialogRef, createFakeSupabaseService, createTestInventoryItem } from '../../../testing/fakes';

describe('ModalTableComponent', () => {
  let component: ModalTableComponent;
  let fixture: ComponentFixture<ModalTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalTableComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModalTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads no containers for an item that has none yet', () => {
    expect(component.existingContainers).toEqual([]);
    expect(component.quantityDerivedFromContainers).toBeFalse();
  });

  it('addContainer() defaults quantity to the item\'s quantityPerContainer', async () => {
    component.editForm.controls.quantityPerContainer.setValue(20);

    component.addContainer();

    expect(component.editableContainers).toEqual([{ id: null, quantity: 20, location: '' }]);
    expect(component.containerQuantitySum).toBe(20);
  });

  it('removeContainer() tracks an existing container for deletion but drops a new, unsaved one silently', () => {
    component.editableContainers = [
      { id: 'box-1', quantity: 10, location: '' },
      { id: null, quantity: 5, location: '' }
    ];

    component.removeContainer(1);
    component.removeContainer(0);

    expect(component.editableContainers).toEqual([]);
    expect(component.removedContainerIds).toEqual(new Set(['box-1']));
  });

  it('quantityDerivedFromContainers reflects editableContainers while editing', () => {
    expect(component.quantityDerivedFromContainers).toBeFalse();

    component.editableContainers = [{ id: 'box-1', quantity: 10, location: '' }];
    component.isEditing = true;

    expect(component.quantityDerivedFromContainers).toBeTrue();
  });
});
