import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { BroadcastModalComponent, BroadcastModalData } from './broadcast-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { createFakeMatDialogRef, createFakeProfile, createFakeSupabaseService } from '../../../testing/fakes';
import { Broadcast } from '../../models/broadcast.model';

const PROFILES = [createFakeProfile({ id: 'user-2', full_name: 'Jamie Lee' })];
const ITEMS = [{ id: 'item-1', name: 'Chiavari Chairs' }];

function createTestBroadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'broadcast-1',
    title: 'Existing broadcast',
    message: 'Existing message',
    createdById: 'user-1',
    createdByLabel: 'Test User',
    createdByAvatarKey: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isEdited: false,
    referencedMembers: [],
    referencedItems: [],
    ...overrides,
  };
}

describe('BroadcastModalComponent', () => {
  let component: BroadcastModalComponent;
  let fixture: ComponentFixture<BroadcastModalComponent>;
  let dialogRef: MatDialogRef<BroadcastModalComponent>;

  async function setup(data: Partial<BroadcastModalData> = {}, options: { error?: { message: string } | null } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<BroadcastModalComponent>;

    await TestBed.configureTestingModule({
      imports: [BroadcastModalComponent],
      providers: [
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { profiles: PROFILES, items: ITEMS, ...data } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BroadcastModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('is not in edit mode and starts with blank fields when no broadcast is passed', async () => {
    await setup();
    expect(component.isEditing).toBeFalse();
    expect(component.form.controls.title.value).toBe('');
    expect(component.form.controls.memberIds.value).toEqual([]);
    expect(component.form.controls.itemIds.value).toEqual([]);
  });

  it('is in edit mode and prefills the form (including references) when a broadcast is passed', async () => {
    const broadcast = createTestBroadcast({
      referencedMembers: [{ id: 'user-2', name: 'Jamie Lee', avatarKey: null }],
      referencedItems: [{ id: 'item-1', name: 'Chiavari Chairs' }]
    });
    await setup({ broadcast });

    expect(component.isEditing).toBeTrue();
    expect(component.form.controls.title.value).toBe('Existing broadcast');
    expect(component.form.controls.message.value).toBe('Existing message');
    expect(component.form.controls.memberIds.value).toEqual(['user-2']);
    expect(component.form.controls.itemIds.value).toEqual(['item-1']);
  });

  describe('save()', () => {
    it('does not save when the title or message is left blank', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');

      await component.save();

      expect(closeSpy).not.toHaveBeenCalled();
      expect(component.form.controls.title.hasError('required')).toBeTrue();
      expect(component.form.controls.message.hasError('required')).toBeTrue();
    });

    it('posts a new broadcast via create_broadcast() and closes with true on success', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      component.form.controls.title.setValue('New broadcast');
      component.form.controls.message.setValue('Something everyone should know.');

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('updates an existing broadcast rather than creating one when editing', async () => {
      const broadcast = createTestBroadcast();
      await setup({ broadcast });
      const closeSpy = spyOn(dialogRef, 'close');
      component.form.controls.title.setValue('Updated title');

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('surfaces a save failure inline rather than closing the dialog', async () => {
      await setup({}, { error: { message: 'insert failed' } });
      const closeSpy = spyOn(dialogRef, 'close');
      component.form.controls.title.setValue('New broadcast');
      component.form.controls.message.setValue('Something everyone should know.');

      await component.save();

      expect(component.error).toBe('insert failed');
      expect(closeSpy).not.toHaveBeenCalled();
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
