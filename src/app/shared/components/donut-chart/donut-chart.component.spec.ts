import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DonutChartComponent } from './donut-chart.component';

async function createComponent(): Promise<ComponentFixture<DonutChartComponent>> {
  await TestBed.configureTestingModule({
    imports: [DonutChartComponent]
  }).compileComponents();
  return TestBed.createComponent(DonutChartComponent);
}

describe('DonutChartComponent', () => {
  it('renders nothing when given no data, rather than a chart with zero-width slices', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.data = [];
    fixture.detectChanges();

    expect(fixture.componentInstance.hasData()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.donut-chart')).toBeNull();
  });

  it('converts each slice\'s value into a percent of the total and a cumulative dash offset', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.data = [
      { label: 'A', value: 25 },
      { label: 'B', value: 75 }
    ];
    fixture.detectChanges();

    const [a, b] = fixture.componentInstance.slices();
    expect(a.percent).toBe(25);
    expect(a.dashOffset).toBe(-0);
    expect(a.dashArray).toBe('25 75');
    expect(b.percent).toBe(75);
    expect(b.dashOffset).toBe(-25);
    expect(b.dashArray).toBe('75 25');
  });

  it('assigns each slice a color, cycling through the palette once it runs out of tokens', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.data = Array.from({ length: 8 }, (_, i) => ({ label: `Slice ${i}`, value: 1 }));
    fixture.detectChanges();

    const slices = fixture.componentInstance.slices();
    // 6 color tokens — the 7th slice (index 6) should cycle back to the same
    // color as the 1st (index 0).
    expect(slices[6].color).toBe(slices[0].color);
    expect(slices[7].color).toBe(slices[1].color);
  });

  it('treats an all-zero-value dataset as having no data, avoiding a divide-by-zero', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.data = [{ label: 'A', value: 0 }, { label: 'B', value: 0 }];
    fixture.detectChanges();

    expect(fixture.componentInstance.hasData()).toBeFalse();
  });

  it('renders the center label/sublabel and a legend row per slice once data is set', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.data = [{ label: 'Furniture', value: 1 }];
    fixture.componentInstance.centerLabel = '$100';
    fixture.componentInstance.centerSublabel = 'total';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.donut-center-label')?.textContent).toContain('$100');
    expect(el.querySelector('.donut-center-sublabel')?.textContent).toContain('total');
    expect(el.querySelectorAll('.donut-legend li').length).toBe(1);
    expect(el.querySelector('.donut-legend-label')?.textContent).toContain('Furniture');
  });
});
