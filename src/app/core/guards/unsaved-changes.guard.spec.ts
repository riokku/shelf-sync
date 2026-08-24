import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { HasUnsavedChanges, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  function runGuard(component: HasUnsavedChanges, dialogOpenReturn?: unknown) {
    const fakeDialog = { open: jasmine.createSpy('open').and.returnValue(dialogOpenReturn) };
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: fakeDialog }]
    });
    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard(component as never, {} as never, {} as never, {} as never)
    );
    return { result, fakeDialog };
  }

  it('allows navigation immediately when there are no unsaved changes, without opening a dialog', async () => {
    const { result, fakeDialog } = runGuard({ hasUnsavedChanges: () => false });

    expect(await result).toBe(true);
    expect(fakeDialog.open).not.toHaveBeenCalled();
  });

  it('opens a confirm dialog and resolves true once the user confirms leaving', async () => {
    const { result, fakeDialog } = runGuard(
      { hasUnsavedChanges: () => true },
      { afterClosed: () => ({ subscribe: (cb: (v: boolean) => void) => cb(true) }) }
    );

    expect(await result).toBe(true);
    expect(fakeDialog.open).toHaveBeenCalledWith(jasmine.any(Function), jasmine.objectContaining({
      data: jasmine.objectContaining({ title: 'Leave without saving?', danger: true })
    }));
  });

  it('resolves false when the user cancels', async () => {
    const { result } = runGuard(
      { hasUnsavedChanges: () => true },
      { afterClosed: () => ({ subscribe: (cb: (v: boolean) => void) => cb(false) }) }
    );

    expect(await result).toBe(false);
  });

  it('resolves false when the dialog is dismissed with no explicit answer (backdrop/Escape)', async () => {
    const { result } = runGuard(
      { hasUnsavedChanges: () => true },
      { afterClosed: () => ({ subscribe: (cb: (v: boolean | undefined) => void) => cb(undefined) }) }
    );

    expect(await result).toBe(false);
  });
});
