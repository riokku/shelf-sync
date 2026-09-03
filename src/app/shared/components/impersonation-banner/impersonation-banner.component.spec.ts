import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImpersonationBannerComponent } from './impersonation-banner.component';
import { ImpersonationService } from '../../../core/impersonation.service';
import { createFakeImpersonationService } from '../../../testing/fakes';

describe('ImpersonationBannerComponent', () => {
  let fixture: ComponentFixture<ImpersonationBannerComponent>;

  async function setup(impersonationService: ImpersonationService) {
    await TestBed.configureTestingModule({
      imports: [ImpersonationBannerComponent],
      providers: [{ provide: ImpersonationService, useValue: impersonationService }]
    }).compileComponents();

    fixture = TestBed.createComponent(ImpersonationBannerComponent);
    fixture.detectChanges();
  }

  it('renders nothing when not impersonating', async () => {
    await setup(createFakeImpersonationService(null));

    expect(fixture.nativeElement.querySelector('.impersonation-banner')).toBeNull();
  });

  it('shows the target name/org and a Stop button while impersonating', async () => {
    await setup(createFakeImpersonationService({
      targetLabel: 'Alex Rivera',
      targetOrgLabel: 'Studio Rio',
      startedAt: new Date().toISOString()
    }));

    const banner: HTMLElement = fixture.nativeElement.querySelector('.impersonation-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Alex Rivera');
    expect(banner.textContent).toContain('Studio Rio');
    expect(banner.querySelector('button')?.textContent).toContain('Stop impersonating');
  });

  it("clicking Stop impersonating calls the service's stop()", async () => {
    const impersonationService = createFakeImpersonationService({
      targetLabel: 'Alex Rivera',
      targetOrgLabel: 'Studio Rio',
      startedAt: new Date().toISOString()
    });
    const stopSpy = spyOn(impersonationService, 'stop').and.resolveTo(undefined);
    await setup(impersonationService);

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.impersonation-banner button');
    button.click();

    expect(stopSpy).toHaveBeenCalled();
  });

  // elapsedLabel recomputes fresh from the stored startedAt on every read
  // (the interval only exists to trigger a fresh template render — see the
  // component's own _tick comment) — so these exercise the getter directly
  // against different startedAt values rather than needing fakeAsync/tick
  // to actually advance a timer.
  describe('elapsedLabel', () => {
    it('reads "started just now" for a session that only just began', async () => {
      await setup(createFakeImpersonationService({
        targetLabel: 'Alex Rivera',
        targetOrgLabel: 'Studio Rio',
        startedAt: new Date().toISOString()
      }));

      expect(fixture.componentInstance.elapsedLabel).toBe('started just now');
    });

    it('reads a relative minute count for a session started a few minutes ago', async () => {
      await setup(createFakeImpersonationService({
        targetLabel: 'Alex Rivera',
        targetOrgLabel: 'Studio Rio',
        startedAt: new Date(Date.now() - 5 * 60_000).toISOString()
      }));

      expect(fixture.componentInstance.elapsedLabel).toBe('started 5 minutes ago');
    });

    it('reads a relative hour count for a session started over an hour ago', async () => {
      await setup(createFakeImpersonationService({
        targetLabel: 'Alex Rivera',
        targetOrgLabel: 'Studio Rio',
        startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString()
      }));

      expect(fixture.componentInstance.elapsedLabel).toBe('started 2 hours ago');
    });
  });
});
