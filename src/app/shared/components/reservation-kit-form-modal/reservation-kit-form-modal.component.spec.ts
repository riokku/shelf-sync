import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ReservationKitFormModalComponent, ReservationKitFormModalData } from './reservation-kit-form-modal.component';
import { ReservationKitService } from '../../../core/reservation-kit.service';
import { createFakeMatDialogRef, createFakeReservationKitService } from '../../../testing/fakes';
import { ReservationKit } from '../../models/reservation-kit.model';

const ITEMS = [
  { id: 'item-1', name: 'Chiavari Chairs' },
  { id: 'item-2', name: 'Round Tables' }
];

describe('ReservationKitFormModalComponent', () => {
  let component: ReservationKitFormModalComponent;
  let fixture: ComponentFixture<ReservationKitFormModalComponent>;
  let dialogRef: MatDialogRef<ReservationKitFormModalComponent>;
  let kitService: ReservationKitService;

  async function setup(data: Partial<ReservationKitFormModalData> = {}) {
    kitService = createFakeReservationKitService();
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<ReservationKitFormModalComponent>;

    await TestBed.configureTestingModule({
      imports: [ReservationKitFormModalComponent],
      providers: [
        { provide: ReservationKitService, useValue: kitService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { items: ITEMS, ...data } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationKitFormModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('is not in edit mode and starts with one blank line when no kit is passed', async () => {
    await setup();
    expect(component.isEditing).toBeFalse();
    expect(component.lines.length).toBe(1);
    expect(component.lines[0].item).toBeNull();
  });

  it('is in edit mode and prefills the form when a kit is passed', async () => {
    const kit: ReservationKit = {
      id: 'kit-1',
      name: 'Wedding package',
      description: 'Everything for a standard ceremony',
      items: [
        { itemId: 'item-1', itemName: 'Chiavari Chairs', quantity: 50 },
        { itemId: 'item-2', itemName: 'Round Tables', quantity: 10 }
      ]
    };
    await setup({ kit });

    expect(component.isEditing).toBeTrue();
    expect(component.nameControl.value).toBe('Wedding package');
    expect(component.lines.length).toBe(2);
    expect(component.lines[0].item).toEqual({ id: 'item-1', name: 'Chiavari Chairs' });
    expect(component.lines[0].quantity).toBe(50);
  });

  describe('filteredItemsForLine()', () => {
    it('excludes items already picked on other lines', async () => {
      await setup();
      component.lines = [
        { searchTerm: 'Chiavari Chairs', item: ITEMS[0], quantity: 50 },
        { searchTerm: '', item: null, quantity: null }
      ];

      expect(component.filteredItemsForLine(1)).toEqual([ITEMS[1]]);
    });
  });

  describe('onLineItemSelected()', () => {
    it('resolves the picked id and fills the line\'s search box with its name', async () => {
      await setup();

      component.onLineItemSelected({ option: { value: 'item-2' } } as never, 0);

      expect(component.lines[0].item).toEqual(ITEMS[1]);
      expect(component.lines[0].searchTerm).toBe('Round Tables');
    });
  });

  describe('save()', () => {
    it('requires a name', async () => {
      await setup();
      const createSpy = spyOn(kitService, 'create');

      await component.save();

      expect(createSpy).not.toHaveBeenCalled();
      expect(component.nameControl.hasError('required')).toBeTrue();
    });

    it('requires at least one complete item line', async () => {
      await setup();
      component.nameControl.setValue('Wedding package');
      const createSpy = spyOn(kitService, 'create');

      await component.save();

      expect(createSpy).not.toHaveBeenCalled();
      expect(component.error).toBe('Add at least one item.');
    });

    it('rejects a line with an item but no quantity', async () => {
      await setup();
      component.nameControl.setValue('Wedding package');
      component.lines[0].item = ITEMS[0];
      const createSpy = spyOn(kitService, 'create');

      await component.save();

      expect(createSpy).not.toHaveBeenCalled();
      expect(component.error).toBe('Every line needs both an item and a quantity.');
    });

    it('creates a new kit with its item lines and closes with true on success', async () => {
      await setup();
      const createSpy = spyOn(kitService, 'create').and.resolveTo(null);
      const closeSpy = spyOn(dialogRef, 'close');

      component.nameControl.setValue('Wedding package');
      component.lines[0].item = ITEMS[0];
      component.lines[0].quantity = 50;

      await component.save();

      expect(createSpy).toHaveBeenCalledWith({
        name: 'Wedding package',
        description: '',
        items: [{ itemId: 'item-1', quantity: 50 }]
      });
      expect(closeSpy).toHaveBeenCalledWith(true);
      expect(component.error).toBeNull();
    });

    it('updates an existing kit rather than creating one when editing', async () => {
      const kit: ReservationKit = {
        id: 'kit-1',
        name: 'Wedding package',
        description: '',
        items: [{ itemId: 'item-1', itemName: 'Chiavari Chairs', quantity: 50 }]
      };
      await setup({ kit });
      const updateSpy = spyOn(kitService, 'update').and.resolveTo(null);
      const createSpy = spyOn(kitService, 'create');

      await component.save();

      expect(updateSpy).toHaveBeenCalledWith('kit-1', jasmine.objectContaining({ name: 'Wedding package' }));
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('surfaces a save failure inline rather than closing the dialog', async () => {
      await setup();
      spyOn(kitService, 'create').and.resolveTo('Name already exists');
      const closeSpy = spyOn(dialogRef, 'close');

      component.nameControl.setValue('Duplicate kit');
      component.lines[0].item = ITEMS[0];
      component.lines[0].quantity = 10;

      await component.save();

      expect(component.error).toBe('Name already exists');
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('addLine() / removeLine()', () => {
    it('adds a blank line and can remove it again', async () => {
      await setup();
      component.addLine();
      expect(component.lines.length).toBe(2);

      component.removeLine(1);
      expect(component.lines.length).toBe(1);
    });
  });

  describe('cancel()', () => {
    it('closes the dialog with no result', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');

      component.cancel();

      expect(closeSpy).toHaveBeenCalledWith();
    });
  });
});
