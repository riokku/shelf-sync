import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { FeedbackModalComponent } from './feedback-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { createFakeAuthService, createFakeMatDialogRef, createFakeProfile, createFakeSupabaseService } from '../../../testing/fakes';

describe('FeedbackModalComponent', () => {
  let component: FeedbackModalComponent;
  let fixture: ComponentFixture<FeedbackModalComponent>;
  let dialogRef: MatDialogRef<FeedbackModalComponent>;

  async function setup(options: { hasSession?: boolean; error?: { message: string } | null } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<FeedbackModalComponent>;

    await TestBed.configureTestingModule({
      imports: [FeedbackModalComponent],
      providers: [
        {
          provide: AuthService,
          useValue: createFakeAuthService(createFakeProfile(), { hasSession: options.hasSession ?? true })
        },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('defaults the feedback type to "general"', async () => {
    await setup();
    expect(component.feedbackForm.controls.type.value).toBe('general');
  });

  describe('submit()', () => {
    it('requires a message', async () => {
      await setup();

      await component.submit();

      expect(component.feedbackForm.controls.message.hasError('required')).toBeTrue();
    });

    it('requires a signed-in session', async () => {
      await setup({ hasSession: false });
      component.feedbackForm.controls.message.setValue('Something is broken.');

      await component.submit();

      expect(component.error).toBe('You must be signed in to send feedback.');
    });

    it('inserts the feedback and closes with true on success', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      component.feedbackForm.controls.type.setValue('bug');
      component.feedbackForm.controls.message.setValue('Something is broken.');

      await component.submit();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('surfaces an insert error rather than closing the dialog', async () => {
      await setup({ error: { message: 'insert failed' } });
      const closeSpy = spyOn(dialogRef, 'close');
      component.feedbackForm.controls.message.setValue('Something is broken.');

      await component.submit();

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
