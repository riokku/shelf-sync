import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BulkActionToolbarComponent } from './bulk-action-toolbar.component';

describe('BulkActionToolbarComponent', () => {
  let component: BulkActionToolbarComponent;
  let fixture: ComponentFixture<BulkActionToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkActionToolbarComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BulkActionToolbarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.selectedCount = 0;
    component.totalCount = 5;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('allSelected / partiallySelected', () => {
    it('is neither when nothing is selected', () => {
      component.selectedCount = 0;
      component.totalCount = 5;
      expect(component.allSelected).toBeFalse();
      expect(component.partiallySelected).toBeFalse();
    });

    it('is allSelected when the selected count matches the total', () => {
      component.selectedCount = 5;
      component.totalCount = 5;
      expect(component.allSelected).toBeTrue();
      expect(component.partiallySelected).toBeFalse();
    });

    it('is partiallySelected when some but not all are selected', () => {
      component.selectedCount = 2;
      component.totalCount = 5;
      expect(component.allSelected).toBeFalse();
      expect(component.partiallySelected).toBeTrue();
    });

    it('is neither when totalCount is 0 (nothing to select)', () => {
      component.selectedCount = 0;
      component.totalCount = 0;
      expect(component.allSelected).toBeFalse();
      expect(component.partiallySelected).toBeFalse();
    });
  });

  it('onSelectAllChange() emits selectAll with the checkbox value', () => {
    component.selectedCount = 0;
    component.totalCount = 5;
    const emitSpy = spyOn(component.selectAll, 'emit');

    component.onSelectAllChange(true);
    expect(emitSpy).toHaveBeenCalledWith(true);

    component.onSelectAllChange(false);
    expect(emitSpy).toHaveBeenCalledWith(false);
  });

  describe('template', () => {
    it('shows "Select all" and hides the actions row when nothing is selected', () => {
      component.selectedCount = 0;
      component.totalCount = 5;
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Select all');
      expect(fixture.nativeElement.querySelector('.bulk-action-toolbar-actions')).toBeNull();
    });

    it('shows the selected count and reveals the actions row (including projected content) once something is selected', () => {
      component.selectedCount = 3;
      component.totalCount = 5;
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('3 selected');
      expect(fixture.nativeElement.querySelector('.bulk-action-toolbar-actions')).not.toBeNull();
    });

    it('clicking Clear emits clear', () => {
      component.selectedCount = 3;
      component.totalCount = 5;
      fixture.detectChanges();
      const clearSpy = spyOn(component.clear, 'emit');

      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const clearButton = buttons.find(button => button.textContent?.includes('Clear'));
      clearButton?.click();

      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('hideSelectAllCheckbox (InventoryComponent only — its own compact checkbox lives elsewhere)', () => {
    it('renders nothing at all when nothing is selected', () => {
      component.hideSelectAllCheckbox = true;
      component.selectedCount = 0;
      component.totalCount = 5;
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.bulk-action-toolbar')).toBeNull();
    });

    it('shows the count as plain text (no checkbox) once something is selected, alongside the actions row', () => {
      component.hideSelectAllCheckbox = true;
      component.selectedCount = 3;
      component.totalCount = 5;
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('3 selected');
      expect(fixture.nativeElement.querySelector('mat-checkbox')).toBeNull();
      expect(fixture.nativeElement.querySelector('.bulk-action-toolbar-actions')).not.toBeNull();
    });
  });
});

@Component({
  template: `
    <app-bulk-action-toolbar [selectedCount]="2" [totalCount]="5">
      <button type="button" class="projected-action">Do something</button>
    </app-bulk-action-toolbar>
  `,
  imports: [BulkActionToolbarComponent]
})
class HostComponent {}

describe('BulkActionToolbarComponent content projection', () => {
  it('renders projected action buttons inside the actions row', () => {
    const fixture = TestBed.configureTestingModule({ imports: [HostComponent] }).createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.projected-action')).not.toBeNull();
  });
});
