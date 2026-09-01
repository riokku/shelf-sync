import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConfettiService } from './confetti.service';
import { ConfettiBurstComponent } from '../shared/components/confetti-burst/confetti-burst.component';

describe('ConfettiService', () => {
  let service: ConfettiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfettiService);
  });

  afterEach(() => {
    // Belt-and-suspenders — every test either lets the cleanup timer run via
    // tick() or never creates a node in the first place (reduced-motion
    // case), but this keeps a leftover node from ever bleeding into another
    // spec file's own body if that ever stops being true.
    document.querySelectorAll('app-confetti-burst').forEach(el => el.remove());
  });

  it('appends a confetti burst to the document body and removes it again once it finishes', fakeAsync(() => {
    service.burst();

    expect(document.body.querySelector('app-confetti-burst')).not.toBeNull();

    tick(ConfettiBurstComponent.DURATION_MS);

    expect(document.body.querySelector('app-confetti-burst')).toBeNull();
  }));

  it('does nothing for a viewer who has asked for reduced motion', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);

    service.burst();

    expect(document.body.querySelector('app-confetti-burst')).toBeNull();
  });
});
