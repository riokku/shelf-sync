import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoadingCaptionComponent } from './loading-caption.component';

describe('LoadingCaptionComponent', () => {
  let fixture: ComponentFixture<LoadingCaptionComponent>;
  let component: LoadingCaptionComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LoadingCaptionComponent] });
    fixture = TestBed.createComponent(LoadingCaptionComponent);
    component = fixture.componentInstance;
  });

  it('renders a non-empty caption on init', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.loading-caption').textContent.trim().length).toBeGreaterThan(0);

    // ngOnInit() schedules a real (not fakeAsync-controlled, since this
    // test needs none of fakeAsync's own machinery) setInterval — without
    // destroying the fixture, that interval keeps firing indefinitely for
    // the rest of this entire Karma run, well past this one test. Caught
    // exactly that way: an earlier version of this test never destroyed
    // the fixture, and a much-later, unrelated spec eventually crashed the
    // whole suite once enough such leftover intervals had piled up.
    fixture.destroy();
  });

  it('rotates to a different caption every ~2.2s', fakeAsync(() => {
    fixture.detectChanges();
    const first = component.caption();

    tick(2200);
    fixture.detectChanges();

    expect(component.caption()).not.toBe(first);

    tick(2200);
    fixture.detectChanges();
    // Nothing left running once the component itself is destroyed —
    // otherwise fakeAsync's own "pending timer" check at the end of this
    // test would fail regardless of the assertions above.
    fixture.destroy();
  }));

  it('stays on one static caption and never rotates for a reduced-motion viewer', fakeAsync(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    fixture.detectChanges();
    const initial = component.caption();

    tick(5000);

    expect(component.caption()).toBe(initial);
  }));
});
