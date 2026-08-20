import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FooterComponent } from '../footer/footer.component';

interface PricingTier {
  key: 'free' | 'basic' | 'pro';
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  ctaLabel: string;
  highlighted: boolean;
  features: string[];
}

/** Public marketing page at `/pricing` — not gated by any guard; hidden
 *  from the app shell's header/footer chrome (see AppComponent.showChrome())
 *  so it can lay out its own nav and footer, same treatment as
 *  LandingComponent.
 *
 *  No billing is wired up yet (Stripe integration is separate, later work)
 *  — every tier's call to action goes to the same real `/register` flow,
 *  since signing up today gives full access regardless of which card was
 *  clicked. The three tiers below are a first pass at what *should*
 *  differentiate them once enforcement exists, chosen deliberately around
 *  what actually drives hosting cost for this app (Supabase): item photos
 *  are by far the biggest lever (storage *and* the repeated bandwidth/
 *  egress cost of browsing them), team size is a moderate, predictable
 *  lever (Auth bills by monthly active users), and inventory/task row
 *  counts are minor unless an org reaches tens of thousands of items.
 *  Core inventory/task functionality is deliberately available on every
 *  tier rather than paywalled — differentiation is about *scale* (item/
 *  team/storage caps) and *admin polish* (branding, export, oversight
 *  tools), not gating the product's basic value proposition this early on. */
@Component({
  selector: 'app-pricing',
  imports: [RouterModule, MatButtonModule, MatIconModule, FooterComponent],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss'
})
export class PricingComponent {
  protected readonly tiers: PricingTier[] = [
    {
      key: 'free',
      name: 'Free',
      tagline: 'Try ShelfSync with a small team.',
      price: '$0',
      priceNote: 'forever',
      ctaLabel: 'Get started free',
      highlighted: false,
      features: [
        'Up to 3 team members',
        'Up to 100 inventory items',
        '500MB of photo storage',
        'Task management & role-based access',
        'Low-stock alerts',
        'Community support'
      ]
    },
    {
      key: 'basic',
      name: 'Basic',
      tagline: 'For a growing team that needs more room.',
      price: '$19',
      priceNote: 'per month',
      ctaLabel: 'Choose Basic',
      highlighted: true,
      features: [
        'Up to 10 team members',
        'Up to 1,000 inventory items',
        '5GB of photo storage',
        'Everything in Free, plus:',
        'Barcode & QR code scanning',
        'Sortable table view with configurable columns',
        'Email support'
      ]
    },
    {
      key: 'pro',
      name: 'Pro',
      tagline: 'For teams that need full control and polish.',
      price: '$49',
      priceNote: 'per month',
      ctaLabel: 'Choose Pro',
      highlighted: false,
      features: [
        'Unlimited team members',
        'Unlimited inventory items',
        '25GB of photo storage',
        'Everything in Basic, plus:',
        'Custom branding — your logo & color theme',
        'Organization data export',
        'Error log & activity oversight',
        'Priority support'
      ]
    }
  ];
}
