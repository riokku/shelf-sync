import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrendChartComponent } from './trend-chart.component';

async function createComponent(): Promise<ComponentFixture<TrendChartComponent>> {
  await TestBed.configureTestingModule({
    imports: [TrendChartComponent]
  }).compileComponents();
  return TestBed.createComponent(TrendChartComponent);
}

describe('TrendChartComponent', () => {
  it('scales bar heights against the largest value in the series', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [
      { label: 'Week 1', value: 2 },
      { label: 'Week 2', value: 10 }
    ];
    fixture.detectChanges();

    const bars = fixture.componentInstance.bars();
    expect(bars[1].heightPercent).toBe(100);
    expect(bars[0].heightPercent).toBe(20);
  });

  it('gives a zero-value week a small visible nub rather than vanishing', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [{ label: 'Week 1', value: 0 }];
    fixture.detectChanges();

    expect(fixture.componentInstance.bars()[0].heightPercent).toBeGreaterThan(0);
  });

  it('flags only the most recent point as current', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [
      { label: 'Week 1', value: 1 },
      { label: 'Week 2', value: 2 },
      { label: 'Week 3', value: 3 }
    ];
    fixture.detectChanges();

    const bars = fixture.componentInstance.bars();
    expect(bars[0].isCurrent).toBeFalse();
    expect(bars[1].isCurrent).toBeFalse();
    expect(bars[2].isCurrent).toBeTrue();
  });

  it('renders no bars when there is no data yet', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(fixture.componentInstance.hasData()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.trend-bar').length).toBe(0);
  });
});
