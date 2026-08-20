import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from '../footer/footer.component';
import { PRICING_TIERS } from '../shared/models/pricing-tier';

/** Public marketing page at `/pricing` — not gated by any guard; hidden
 *  from the app shell's header/footer chrome (see AppComponent.showChrome())
 *  so it can lay out its own nav and footer, same treatment as
 *  LandingComponent.
 *
 *  No billing is wired up yet (Stripe integration is separate, later work)
 *  — every tier's call to action goes to the same real `/register` flow,
 *  since signing up today gives full access regardless of which card was
 *  clicked. The three tiers (shared/models/pricing-tier.ts, also read by
 *  ManageBillingComponent's admin-only preview) are a first pass at what
 *  *should* differentiate them once enforcement exists, chosen deliberately
 *  around what actually drives hosting cost for this app (Supabase): item
 *  photos are by far the biggest lever (storage *and* the repeated
 *  bandwidth/egress cost of browsing them), team size is a moderate,
 *  predictable lever (Auth bills by monthly active users), and inventory/
 *  task row counts are minor unless an org reaches tens of thousands of
 *  items. Core inventory/task functionality is deliberately available on
 *  every tier rather than paywalled — differentiation is about *scale*
 *  (item/team/storage caps) and *admin polish* (branding, export,
 *  oversight tools), not gating the product's basic value proposition
 *  this early on. */
@Component({
  selector: 'app-pricing',
  imports: [RouterModule, MatButtonModule, MatIconModule, FooterComponent],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss'
})
export class PricingComponent {
  protected readonly tiers = PRICING_TIERS;
}
