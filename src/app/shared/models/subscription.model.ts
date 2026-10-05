/** A org's real Stripe subscription state, backing manage/billing and
 *  /pricing — see BillingService. `null` (no row at all) means the org has
 *  never subscribed and is on the implicit Free tier, the same "missing row
 *  means the default" convention site_settings' own columns already use
 *  throughout this app. `status` mirrors Stripe's own Subscription.status
 *  values verbatim (see subscriptions.status's own check constraint). */
export interface OrgSubscription {
  tier: 'free' | 'basic' | 'pro';
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
