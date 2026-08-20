import { AfterViewInit, Component, DestroyRef, ElementRef, WritableSignal, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from '../footer/footer.component';
import { AuthService } from '../core/auth.service';

/** Public marketing page at `/` — the value-prop pitch for signed-out
 *  visitors. Distinct from HomeComponent (`/home`), which is the
 *  post-login hub of cards linking into the app. Not gated by any guard;
 *  hidden from the app shell's header/footer chrome (see
 *  AppComponent.showChrome()) so it can lay out its own nav and footer.
 *
 *  A visitor who already has a session (landed here directly, or via the
 *  brand link/logo from elsewhere) sees a trimmed nav — just Dashboard and
 *  Logout instead of Pricing/Log in/Sign up, none of which make sense once
 *  already signed in. Scoped to the nav only; the hero/bottom CTAs below
 *  still always point at /register — this page's job for a signed-in
 *  visitor is just "get them out of here", not a second dashboard. */
@Component({
  selector: 'app-landing',
  imports: [RouterModule, MatButtonModule, MatIconModule, FooterComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements AfterViewInit {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }

  // Data-driven rather than repeated markup, mainly so the template can
  // stagger each card/step's scroll-reveal delay off its index (see
  // [style.transition-delay.ms] in the template) instead of the .scss
  // needing a hand-written :nth-child rule per item.
  protected readonly features = [
    { icon: 'inventory_2', title: 'Real-time tracking', description: "See exactly what's on hand, what's checked out, and what's running low, updated the moment anyone makes a change." },
    { icon: 'checklist', title: 'Team task management', description: 'Assign work, track status, and keep restocks and follow-ups from falling through the cracks.' },
    { icon: 'history', title: 'Full activity history', description: 'Every edit to every item is logged in plain language, so you always know what changed and who changed it.' },
    { icon: 'admin_panel_settings', title: 'Role-based access', description: 'Admins and managers control the inventory catalog; staff can still check items in and out day to day.' },
    { icon: 'groups', title: 'Built for your whole team', description: 'Invite teammates with a link, drop them straight into your organization, and get everyone on the same page.' },
    { icon: 'palette', title: 'Your brand, your colors', description: 'Swap in your own logo and pick a color theme, so ShelfSync looks like it belongs to your organization.' }
  ];

  // Two independent, looping "something just changed" events on the mock
  // inventory card — each pairs a value signal with a transient *Flash
  // signal (see toggleWithFlash()) that pulses true for one animation
  // cycle so the affected row(s) can show a brief highlight (.mock-row.
  // flash) rather than the value just silently swapping. Both left at
  // their initial values under prefers-reduced-motion (see
  // animateMockCardUpdates() below) — the crossfade/flash transitions are
  // already killed globally by that @media rule, so without also
  // skipping the intervals the values would still silently swap with no
  // visible cue.
  //
  // checkedIn: the laptop row's badge, on its own timer.
  protected readonly checkedIn = signal(false);
  protected readonly checkedInFlash = signal(false);

  // restocked: the harness row's qty/badge *and* the task row's status,
  // on a shared timer — a restock event and the task that caused it,
  // changing together rather than two unrelated coincidences.
  protected readonly restocked = signal(false);
  protected readonly restockFlash = signal(false);

  protected readonly steps = [
    { title: 'Create your organization', description: 'Sign up and set up your workspace in a couple of minutes — no setup call required.' },
    { title: 'Add your inventory', description: 'Bring in what you already track, with photos and details, and invite your team to join you.' },
    { title: 'Track, assign, and grow', description: "Check items in and out, assign tasks, and let ShelfSync keep the history so you don't have to." }
  ];

  ngAfterViewInit(): void {
    this.revealOnScroll();
    this.animateMockCardUpdates();
  }

  /** Starts both looping "value changed" timers on the mock inventory card
   *  — the laptop's check-in status and the harness/task restock pair —
   *  each on its own interval so the two never read as one synced wave.
   *  Cleared on destroy via DestroyRef rather than an OnDestroy hook,
   *  since this is the component's only teardown need. */
  private animateMockCardUpdates(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const checkInId = window.setInterval(() => this.toggleWithFlash(this.checkedIn, this.checkedInFlash), 4500);
    const restockId = window.setInterval(() => this.toggleWithFlash(this.restocked, this.restockFlash), 6000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(checkInId);
      window.clearInterval(restockId);
    });
  }

  /** Flips `value` and pulses `flash` true for one flash-animation cycle
   *  (see @keyframes row-flash), then false again — `flash` has to
   *  actually return to false between pulses, not just stay true, or
   *  re-triggering the same CSS animation on the next change wouldn't
   *  restart it. */
  private toggleWithFlash(value: WritableSignal<boolean>, flash: WritableSignal<boolean>): void {
    value.update(v => !v);
    flash.set(true);
    // Matches @keyframes row-flash's own 1.5s length — removing the class
    // any sooner would cut the fade-out off abruptly instead of letting it
    // finish.
    window.setTimeout(() => flash.set(false), 1500);
  }

  /** Fades/slides `.reveal` elements (the feature cards and how-it-works
   *  steps) in the first time each scrolls into view, then stops watching
   *  it — a one-shot reveal rather than something that replays on every
   *  scroll up/down. Skipped for visitors who've asked for less motion:
   *  every element is just marked visible immediately instead, since the
   *  underlying content isn't hidden on purpose, only its entrance is. */
  private revealOnScroll(): void {
    const elements = this.host.nativeElement.querySelectorAll<HTMLElement>('.reveal');
    if (!elements.length) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.15 });

    elements.forEach(el => observer.observe(el));
  }
}
