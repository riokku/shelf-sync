import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrendChartComponent } from './trend-chart.component';

async function createComponent(): Promise<ComponentFixture<TrendChartComponent>> {
  await TestBed.configureTestingModule({
    imports: [TrendChartComponent]
  }).compileComponents();
  return TestBed.createComponent(TrendChartComponent);
}

describe('TrendChartComponent', () => {
  it('scales point height (bottomPercent) against the largest value in the series', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [
      { label: 'Week 1', value: 2 },
      { label: 'Week 2', value: 10 }
    ];
    fixture.detectChanges();

    const points = fixture.componentInstance.plottedPoints();
    expect(points[1].bottomPercent).toBe(90); // 10 + (10/10)*80
    expect(points[0].bottomPercent).toBe(26); // 10 + (2/10)*80
  });

  it('gives a zero-value week a bottomPercent above the baseline rather than flush against it', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [{ label: 'Week 1', value: 0 }];
    fixture.detectChanges();

    expect(fixture.componentInstance.plottedPoints()[0].bottomPercent).toBe(10);
  });

  it('spaces points evenly left to right, centering a lone point', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [
      { label: 'Week 1', value: 1 },
      { label: 'Week 2', value: 2 },
      { label: 'Week 3', value: 3 }
    ];
    fixture.detectChanges();

    const points = fixture.componentInstance.plottedPoints();
    expect(points.map(point => point.xPercent)).toEqual([0, 50, 100]);
  });

  it('centers a single point at 50% rather than dividing by zero', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [{ label: 'Week 1', value: 5 }];
    fixture.detectChanges();

    expect(fixture.componentInstance.plottedPoints()[0].xPercent).toBe(50);
  });

  it('flags only the most recent point as current', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.points = [
      { label: 'Week 1', value: 1 },
      { label: 'Week 2', value: 2 },
      { label: 'Week 3', value: 3 }
    ];
    fixture.detectChanges();

    const points = fixture.componentInstance.plottedPoints();
    expect(points[0].isCurrent).toBeFalse();
    expect(points[1].isCurrent).toBeFalse();
    expect(points[2].isCurrent).toBeTrue();
  });

  it('renders no points when there is no data yet', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    expect(fixture.componentInstance.hasData()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.trend-point').length).toBe(0);
  });

  describe('hasLine()', () => {
    it('is false for zero or one point — nothing to draw a line between', async () => {
      const fixture = await createComponent();
      fixture.componentInstance.points = [{ label: 'Week 1', value: 5 }];
      fixture.detectChanges();

      expect(fixture.componentInstance.hasLine()).toBeFalse();
      expect(fixture.nativeElement.querySelector('.trend-line')).toBeNull();
      // The one point's own dot still renders even with no line to connect it to.
      expect(fixture.nativeElement.querySelectorAll('.trend-point').length).toBe(1);
    });

    it('is true for two or more points', async () => {
      const fixture = await createComponent();
      fixture.componentInstance.points = [
        { label: 'Week 1', value: 1 },
        { label: 'Week 2', value: 2 }
      ];
      fixture.detectChanges();

      expect(fixture.componentInstance.hasLine()).toBeTrue();
      expect(fixture.nativeElement.querySelector('.trend-line')).not.toBeNull();
    });
  });

  describe('linePointsAttr() / areaPointsAttr()', () => {
    it('flips bottomPercent into svg-space (y grows downward) for the line', async () => {
      const fixture = await createComponent();
      fixture.componentInstance.points = [
        { label: 'Week 1', value: 0 },
        { label: 'Week 2', value: 10 }
      ];
      fixture.detectChanges();

      expect(fixture.componentInstance.linePointsAttr()).toBe('0,90 100,10');
    });

    it('closes the area polygon to the baseline at the first and last x positions', async () => {
      const fixture = await createComponent();
      fixture.componentInstance.points = [
        { label: 'Week 1', value: 0 },
        { label: 'Week 2', value: 10 }
      ];
      fixture.detectChanges();

      expect(fixture.componentInstance.areaPointsAttr()).toBe('0,100 0,90 100,10 100,100');
    });
  });

  it('gives each rendered instance its own gradient id', async () => {
    // TestBed only needs configuring once — two TrendChartComponent
    // instances from the same configured module, not two separate
    // createComponent() calls (which would each try to reconfigure an
    // already-instantiated TestBed and fail).
    await TestBed.configureTestingModule({ imports: [TrendChartComponent] }).compileComponents();
    const first = TestBed.createComponent(TrendChartComponent);
    const second = TestBed.createComponent(TrendChartComponent);

    expect(first.componentInstance.gradientId).not.toBe(second.componentInstance.gradientId);
  });
});
