import { ApplicationRef, EnvironmentInjector, Injectable, createComponent, inject } from '@angular/core';
import { ConfettiBurstComponent } from '../shared/components/confetti-burst/confetti-burst.component';

/** Fires a brief, full-viewport confetti burst for a genuine "just
 *  happened, right here" celebration moment — see each call site's own doc
 *  comment for why that particular moment qualifies (a completed action the
 *  viewer can actually see resolve on the same page load, not a milestone
 *  whose underlying change happened somewhere else — see HomeComponent's
 *  own doc comment on why its Getting Started card deliberately skipped a
 *  "just completed" animation for exactly that reason). Root-provided, same
 *  "thin wrapper other components call instead of reaching for the
 *  machinery directly" shape NotificationService already has for
 *  MatSnackBar — except this attaches ConfettiBurstComponent by hand via
 *  createComponent()/ApplicationRef rather than through MatSnackBar/CDK
 *  Overlay: a decorative, click-through, no-content overlay has no need for
 *  either's dialog-style machinery (backdrop, focus trap, a positioning
 *  strategy), just a plain DOM node appended to <body> and torn down again
 *  once the animation finishes. */
@Injectable({ providedIn: 'root' })
export class ConfettiService {
  private applicationRef = inject(ApplicationRef);
  private environmentInjector = inject(EnvironmentInjector);

  burst() {
    // Same convention every other ambient/decorative animation in this app
    // already follows (see e.g. LandingComponent's own reduced-motion
    // checks) — skipped outright rather than rendered inert, since there's
    // nothing here for a reduced-motion viewer to usefully see mid-animation.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const componentRef = createComponent(ConfettiBurstComponent, { environmentInjector: this.environmentInjector });
    document.body.appendChild(componentRef.location.nativeElement);
    this.applicationRef.attachView(componentRef.hostView);
    // Dynamically created components aren't picked up by Angular's own
    // change-detection cycle until the next tick on their own — forcing one
    // immediately means the burst renders (and starts falling) right away
    // rather than however long zone.js takes to next go stable.
    componentRef.changeDetectorRef.detectChanges();

    // ConfettiBurstComponent.DURATION_MS matches its own longest individual
    // piece's animation-duration — everything has visibly finished falling
    // by the time this fires, so there's nothing to abruptly cut off.
    setTimeout(() => {
      this.applicationRef.detachView(componentRef.hostView);
      componentRef.destroy();
    }, ConfettiBurstComponent.DURATION_MS);
  }
}
