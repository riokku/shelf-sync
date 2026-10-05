import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SavedViewsBarComponent } from './saved-views-bar.component';
import { AuthService } from '../../../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../../../testing/fakes';

interface TestFilters {
  search: string;
  category: string | null;
}

describe('SavedViewsBarComponent', () => {
  let fixture: ComponentFixture<SavedViewsBarComponent<TestFilters>>;
  let component: SavedViewsBarComponent<TestFilters>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [SavedViewsBarComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SavedViewsBarComponent<TestFilters>);
    component = fixture.componentInstance;
    component.pageKey = 'test-page';
    component.currentFilters = { search: '', category: null };
    // Most tests in this file are about the "something's actually filtered"
    // scenario (saving/applying/removing a view) — the dedicated "disabled
    // by default" describe block below overrides this back to false for
    // its own cases.
    component.hasActiveFilters = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with no saved views', () => {
    expect(component.views).toEqual([]);
  });

  it('loads whatever was already saved for this user+page on init', () => {
    localStorage.setItem(
      'shelf-sync:saved-views:user-1:test-page',
      JSON.stringify([{ id: 'v1', name: 'Low stock', filters: { search: '', category: 'chairs' } }])
    );

    const reloaded = TestBed.createComponent(SavedViewsBarComponent<TestFilters>);
    reloaded.componentInstance.pageKey = 'test-page';
    reloaded.componentInstance.currentFilters = { search: '', category: null };
    reloaded.detectChanges();

    expect(reloaded.componentInstance.views.length).toBe(1);
    expect(reloaded.componentInstance.views[0].name).toBe('Low stock');
  });

  describe('confirmSave()', () => {
    it('adds a new saved view carrying the current filters, and persists it', () => {
      component.currentFilters = { search: 'chairs', category: 'furniture' };
      component.startNaming();
      component.nameControl.setValue('My chairs');

      component.confirmSave();

      expect(component.views.length).toBe(1);
      expect(component.views[0].name).toBe('My chairs');
      expect(component.views[0].filters).toEqual({ search: 'chairs', category: 'furniture' });
      expect(component.isNaming).toBe(false);

      const stored = JSON.parse(localStorage.getItem('shelf-sync:saved-views:user-1:test-page')!);
      expect(stored.length).toBe(1);
    });

    it('does nothing for a blank/whitespace-only name', () => {
      component.startNaming();
      component.nameControl.setValue('   ');

      component.confirmSave();

      expect(component.views).toEqual([]);
      expect(component.isNaming).toBe(true);
    });

    it('rejects a case-insensitive duplicate name instead of creating a second view', () => {
      component.startNaming();
      component.nameControl.setValue('Low stock');
      component.confirmSave();

      component.startNaming();
      component.nameControl.setValue('low stock');
      component.confirmSave();

      expect(component.views.length).toBe(1);
      expect(component.duplicateNameError).toBe(true);
      expect(component.isNaming).toBe(true); // stays open so the name can be corrected
    });
  });

  describe('"Save current view", disabled until something is actually filtered', () => {
    it('renders the button disabled by default (hasActiveFilters = false)', () => {
      component.hasActiveFilters = false;
      fixture.detectChanges();

      const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.saved-view-add-button');
      expect(addButton.disabled).toBe(true);
    });

    it('startNaming() is a no-op while hasActiveFilters is false, even called directly', () => {
      component.hasActiveFilters = false;

      component.startNaming();

      expect(component.isNaming).toBe(false);
    });

    it('enables the button, and lets startNaming() actually open the form, once hasActiveFilters is true', () => {
      component.hasActiveFilters = false;
      fixture.detectChanges();
      let addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.saved-view-add-button');
      expect(addButton.disabled).toBe(true);

      component.hasActiveFilters = true;
      fixture.detectChanges();
      addButton = fixture.nativeElement.querySelector('.saved-view-add-button');

      expect(addButton.disabled).toBe(false);
      addButton.click();
      expect(component.isNaming).toBe(true);
    });
  });

  describe('removeView()', () => {
    it('removes the view from both memory and storage', () => {
      component.startNaming();
      component.nameControl.setValue('Low stock');
      component.confirmSave();
      const [view] = component.views;

      component.removeView(view);

      expect(component.views).toEqual([]);
      const stored = JSON.parse(localStorage.getItem('shelf-sync:saved-views:user-1:test-page')!);
      expect(stored).toEqual([]);
    });
  });

  describe('name form submission (real DOM event, not a direct method call)', () => {
    // Regression coverage for a real, previously-shipped bug class in this
    // codebase (see LockUserAccountModalComponent's own history): a bare
    // <form (ngSubmit)> with per-field [formControl]s but no [formGroup] on
    // the <form> itself silently never fires ngSubmit without FormsModule
    // imported alongside ReactiveFormsModule — clicking Save falls through
    // to a real native form submission instead. A test that calls
    // confirmSave() directly (as every other test in this file does) can't
    // catch that class of bug; only dispatching a real submit event can.
    it('actually saves the view on a real form submit, and prevents the native page reload', () => {
      component.startNaming();
      fixture.detectChanges();
      component.nameControl.setValue('My view');

      const form: HTMLFormElement = fixture.nativeElement.querySelector('.saved-view-name-form');
      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(component.views.length).toBe(1);
      expect(component.views[0].name).toBe('My view');
    });
  });

  describe('applyView', () => {
    it('emits the saved view\'s own filters object when its chip is clicked', () => {
      component.currentFilters = { search: 'chairs', category: 'furniture' };
      component.startNaming();
      component.nameControl.setValue('My chairs');
      component.confirmSave();
      fixture.detectChanges();

      const emitted: TestFilters[] = [];
      component.applyView.subscribe(filters => emitted.push(filters));

      const applyButton: HTMLButtonElement = fixture.nativeElement.querySelector('.saved-view-chip-apply');
      applyButton.click();

      expect(emitted).toEqual([{ search: 'chairs', category: 'furniture' }]);
    });
  });

  describe('isActive()', () => {
    it('is true only for the saved view whose filters deep-equal the current ones', () => {
      component.currentFilters = { search: 'chairs', category: 'furniture' };
      component.startNaming();
      component.nameControl.setValue('My chairs');
      component.confirmSave();
      const [view] = component.views;

      expect(component.isActive(view)).toBe(true);

      component.currentFilters = { search: 'tables', category: 'furniture' };
      expect(component.isActive(view)).toBe(false);
    });
  });

});

describe('SavedViewsBarComponent user isolation', () => {
  it('does not see another user\'s saved views for the same page+storage', () => {
    localStorage.setItem(
      'shelf-sync:saved-views:user-1:test-page',
      JSON.stringify([{ id: 'v1', name: 'Mine', filters: { search: '', category: null } }])
    );

    TestBed.configureTestingModule({
      imports: [SavedViewsBarComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-2' })) }
      ]
    });
    const fixture = TestBed.createComponent(SavedViewsBarComponent<TestFilters>);
    fixture.componentInstance.pageKey = 'test-page';
    fixture.componentInstance.currentFilters = { search: '', category: null };
    fixture.detectChanges();

    expect(fixture.componentInstance.views).toEqual([]);

    localStorage.clear();
  });
});
