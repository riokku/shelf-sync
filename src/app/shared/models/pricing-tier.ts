/** Single source of truth for the three pricing tiers (Free/Basic/Pro),
 *  shared by PricingComponent (the public /pricing page) and
 *  ManageBillingComponent (the admin-only Manage > Billing preview) so the
 *  numbers a prospective customer sees and the caps an existing org is
 *  measured against on their Billing page never drift apart. See
 *  PricingComponent's own doc comment for why these particular caps/
 *  features were chosen. `null` in a limit field means unlimited. */
export interface PricingTierLimits {
  maxTeamMembers: number | null;
  maxInventoryItems: number | null;
  storageLimitMb: number | null;
}

export interface PricingTier {
  key: 'free' | 'basic' | 'pro';
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  ctaLabel: string;
  highlighted: boolean;
  limits: PricingTierLimits;
  features: string[];
}

export const PRICING_TIERS: PricingTier[] = [
  {
    key: 'free',
    name: 'Free',
    tagline: 'Try ShelfSync with a small team.',
    price: '$0',
    priceNote: 'forever',
    ctaLabel: 'Get started free',
    highlighted: false,
    limits: { maxTeamMembers: 3, maxInventoryItems: 100, storageLimitMb: 500 },
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
    price: '$19.99',
    priceNote: 'per month',
    ctaLabel: 'Choose Basic',
    highlighted: true,
    limits: { maxTeamMembers: 10, maxInventoryItems: 1000, storageLimitMb: 5000 },
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
    price: '$49.99',
    priceNote: 'per month',
    ctaLabel: 'Choose Pro',
    highlighted: false,
    limits: { maxTeamMembers: null, maxInventoryItems: null, storageLimitMb: 25000 },
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

export function pricingTierByKey(key: PricingTier['key']): PricingTier {
  const tier = PRICING_TIERS.find(t => t.key === key);
  if (!tier) {
    throw new Error(`Unknown pricing tier: ${key}`);
  }
  return tier;
}
