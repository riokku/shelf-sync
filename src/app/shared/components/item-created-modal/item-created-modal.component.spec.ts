import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ItemCreatedModalComponent } from './item-created-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('ItemCreatedModalComponent', () => {
  let component: ItemCreatedModalComponent;
  let fixture: ComponentFixture<ItemCreatedModalComponent>;
  let dialogRef: MatDialogRef<ItemCreatedModalComponent>;

  async function setup() {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<ItemCreatedModalComponent>;

    await TestBed.configureTestingModule({
      imports: [ItemCreatedModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { itemName: 'Folding Chair' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ItemCreatedModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('shows the created item\'s name', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('Folding Chair');
  });

  it('addAnother() closes the dialog with no result', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.addAnother();

    expect(closeSpy).toHaveBeenCalledWith();
  });

  it('viewInventory() closes the dialog with \'view\'', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.viewInventory();

    expect(closeSpy).toHaveBeenCalledWith('view');
  });
});
