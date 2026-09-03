import { Component, DestroyRef, NgZone, OnInit, inject, signal } from '@angular/core';

/** A small pool of witty, warehouse/rental-themed lines — genuinely
 *  meaningless (they don't reflect what's actually being fetched), purely
 *  a bit of personality for the wait rather than a progress indicator.
 *  Deliberately not shared with any other feature (e.g. StudioComponent's
 *  own hero) — this is scoped to this one component. */
const LOADING_CAPTIONS = [
  'Untangling extension cords…',
  'Recounting the folding chairs…',
  'Herding string lights…',
  'Straightening the tablecloths…',
  'Reticulating shelf splines…',
  'Dusting off the warehouse…',
  'Making sure nothing\'s checked out to a ghost…',
  'Sweet-talking the barcode scanner…',
  'Untying the tent stakes…',
  'Double-checking nobody misplaced the punch bowl…',
];

/** A small "still working on it" caption shown alongside a page's own
 *  shape-matching skeleton placeholders (see shared/styles/_skeleton.scss)
 *  — cycles through LOADING_CAPTIONS above every few seconds rather than
 *  showing one static line, since some initial loads run long enough for a
 *  single caption to feel stale sitting there. Started narrow (Inventory
 *  and Tasks — this app's two busiest pages, the same two the skeleton
 *  treatment itself started on) rather than swept onto every loading state
 *  in the app; a natural extension to pick up elsewhere later the same way
 *  skeleton loading itself was adopted incrementally.
 *
 *  The rotation is skipped under prefers-reduced-motion — not because
 *  swapping text is itself motion-sickness-inducing the way a moving
 *  visual is, but because it's exactly the kind of unprompted, auto-
 *  playing content change every other ambient animation in this app
 *  already gates behind this same check; one static (but still randomly
 *  picked) caption is shown instead. aria-live="polite" announces each
 *  swap without interrupting whatever the screen reader is already
 *  reading, the same non-intrusive treatment this app's toasts get. */
@Component({
  selector: 'app-loading-caption',
  standalone: true,
  template: `<p class="loading-caption" aria-live="polite">{{ caption() }}</p>`,
  styleUrl: './loading-caption.component.scss',
})
export class LoadingCaptionComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private ngZone = inject(NgZone);

  private static pickRandom(exclude?: string): string {
    const pool = exclude ? LOADING_CAPTIONS.filter(line => line !== exclude) : LOADING_CAPTIONS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  caption = signal(LoadingCaptionComponent.pickRandom());

  ngOnInit() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // Scheduled outside Angular's zone — a live, indefinitely-repeating
    // setInterval left running *inside* the zone is a real, previously-hit
    // gotcha in this app: NgZone/ComponentFixture.whenStable() treat one as
    // permanently-pending work, so a live loading caption sitting next to a
    // page still loading its own real data would silently hang every spec
    // in that page that awaits whenStable() (see ManageTeamComponent's own
    // 30s presence-poll interval and its spec's identical
    // runOutsideAngular-adjacent workaround for the same class of bug).
    // ngZone.run() below re-enters the zone just for the signal write, so
    // change detection still actually picks up each caption swap.
    this.ngZone.runOutsideAngular(() => {
      // Picks the *next* caption fresh each tick (excluding whatever's
      // currently showing, so it can't immediately repeat itself) rather
      // than shuffling the whole list up front — simpler, and nobody's
      // watching closely enough for true no-repeats-until-exhausted to
      // matter here.
      const intervalId = window.setInterval(() => {
        this.ngZone.run(() => this.caption.set(LoadingCaptionComponent.pickRandom(this.caption())));
      }, 2200);

      this.destroyRef.onDestroy(() => window.clearInterval(intervalId));
    });
  }
}
