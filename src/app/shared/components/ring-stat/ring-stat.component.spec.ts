import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RingStatComponent } from './ring-stat.component';

async function createComponent(): Promise<ComponentFixture<RingStatComponent>> {
  await TestBed.configureTestingModule({
    imports: [RingStatComponent]
  }).compileComponents();
  return TestBed.createComponent(RingStatComponent);
}

describe('RingStatComponent', () => {
  it('builds a dash array from the percent, filling the rest of the 100-length circumference', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.percent = 30;
    fixture.detectChanges();

    expect(fixture.componentInstance.clampedPercent()).toBe(30);
    expect(fixture.componentInstance.dashArray()).toBe('30 70');
  });

  it('clamps a percent above 100 down to 100', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.percent = 150;
    fixture.detectChanges();

    expect(fixture.componentInstance.clampedPercent()).toBe(100);
  });

  it('clamps a negative percent up to 0', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.percent = -20;
    fixture.detectChanges();

    expect(fixture.componentInstance.clampedPercent()).toBe(0);
  });

  it('renders the clamped percent as the center value and the label below it', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.percent = 42;
    fixture.componentInstance.label = 'Completion rate';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.ring-center-value')?.textContent).toContain('42%');
    expect(el.querySelector('.ring-label')?.textContent).toContain('Completion rate');
  });

  it('omits the label element entirely when no label is given', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.percent = 42;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ring-label')).toBeNull();
  });
});
