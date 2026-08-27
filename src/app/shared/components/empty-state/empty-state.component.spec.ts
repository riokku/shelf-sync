import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

async function createComponent(): Promise<ComponentFixture<EmptyStateComponent>> {
  await TestBed.configureTestingModule({
    imports: [EmptyStateComponent]
  }).compileComponents();
  return TestBed.createComponent(EmptyStateComponent);
}

describe('EmptyStateComponent', () => {
  it('renders the icon inside a badge, and the message, by default', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'inventory_2';
    fixture.componentInstance.message = 'No items yet.';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.empty-state-icon-badge mat-icon')?.textContent).toContain('inventory_2');
    expect(el.querySelector('p')?.textContent).toContain('No items yet.');
  });

  it('omits the icon badge in compact mode, rendering the bare icon inline instead', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'inventory_2';
    fixture.componentInstance.compact = true;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.empty-state-icon-badge')).toBeNull();
    expect(el.querySelector('.empty-state-icon')?.textContent).toContain('inventory_2');
  });

  it('applies the error class only for the error variant', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.variant = 'error';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state.error')).not.toBeNull();
  });

  it('does not apply the error class for the default neutral variant', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state.error')).toBeNull();
  });
});
