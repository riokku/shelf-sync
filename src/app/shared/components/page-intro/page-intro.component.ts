import { Component, Input, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth.service';

/** A one-time, dismissible "welcome" spotlight for a page a user (any role)
 *  might be landing on for the first time — Inventory, Tasks, and the
 *  Manage hub all use this. Distinct from `HomeComponent`'s own "Getting
 *  started" checklist: that one is an org-wide, admin/manager-only setup
 *  task list gated on real data (has anyone created an item/task/invited
 *  the team yet); this is a lightweight, purely-cosmetic "here's what this
 *  page is" hint for any role, with nothing to check against.
 *
 *  Deliberately built to be *noticed* rather than blend in — a real first
 *  impression, not a system notice — by borrowing this app's existing bold
 *  treatments rather than inventing a new one: `EmptyStateComponent`'s
 *  circular gradient icon badge (scaled up further, since this is the one
 *  focal point of a first visit rather than an already-empty list) and a
 *  diluted two-tone gradient wash + border mirroring `PageHeaderComponent`'s
 *  own `zone` treatment, in place of the flat single-line `surface-variant`
 *  bar this replaced. A real heading (`title`, display-font via this app's
 *  global `h1`-`h4` rule) plus body copy (`text`) reads as a welcome
 *  message, not a caption — and a labeled "Got it, thanks" button sits
 *  alongside the small corner-`X`, so dismissing it is a deliberate choice
 *  rather than only a small icon-only affordance easy to miss or misclick.
 *
 *  Dismissal is `localStorage`, per *user* (not per organization the way
 *  `HomeComponent`'s own dismissal key is — that card's dismissal is
 *  legitimately shared/org-wide since it tracks the org's own setup
 *  progress; this is purely about whether *this specific person* has
 *  already seen this page's orientation, so a teammate dismissing their
 *  own Inventory hint shouldn't hide it from someone else on their first
 *  visit). Best-effort — wrapped in try/catch the same way
 *  `HomeComponent.dismissGettingStarted()` already is, since `localStorage`
 *  can throw in a private-browsing/storage-blocked context; worst case the
 *  hint just reappears next visit. */
@Component({
  selector: 'app-page-intro',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './page-intro.component.html',
  styleUrl: './page-intro.component.scss',
})
export class PageIntroComponent implements OnInit {
  private authService = inject(AuthService);

  /** A short, unique-per-page id (e.g. 'inventory', 'tasks', 'manage') —
   *  part of the storage key, so each page's hint is dismissed
   *  independently of the others. */
  @Input({ required: true }) pageKey = '';
  @Input() icon = 'info';
  /** A short "Welcome to X" heading — the thing that actually announces this
   *  as a first-run splash rather than a caption. */
  @Input({ required: true }) title = '';
  @Input({ required: true }) text = '';

  // Defaults true (hidden) until ngOnInit resolves the real value — ngOnInit
  // runs before the first render, so this never actually flashes the
  // banner for a returning user who already dismissed it; it just means a
  // brand-new user sees it appear from "nothing" rather than it being
  // there from literally frame zero, which reads the same either way.
  dismissed = true;

  ngOnInit() {
    this.dismissed = this.readDismissed();
  }

  private dismissedStorageKey(): string {
    const userId = this.authService.session()?.user.id ?? 'unknown';
    return `shelf-sync:page-intro-dismissed:${userId}:${this.pageKey}`;
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(this.dismissedStorageKey()) === '1';
    } catch {
      return false;
    }
  }

  dismiss() {
    this.dismissed = true;
    try {
      localStorage.setItem(this.dismissedStorageKey(), '1');
    } catch {
      // Best-effort — see this class's own doc comment.
    }
  }
}
