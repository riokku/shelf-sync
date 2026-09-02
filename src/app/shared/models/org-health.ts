/** A Bronze/Silver/Gold signal for how much of ShelfSync's own feature set an
 *  organization actually uses — not a resource-cost measure the way
 *  StudioUsageComponent's existing item/member/storage leaderboard already
 *  is (see platform_get_organization_usage()'s own migration comment for
 *  that distinction), but a support-attention/upsell signal: is this org
 *  just parked on the basics, or actually getting value out of the product.
 *
 *  Deliberately a plain count-of-features-adopted formula rather than
 *  something that also weighs recency/engagement — easy to explain at a
 *  glance ("uses 4 of 5"), and every signal here is itself a count already
 *  returned by platform_get_organization_usage() (see
 *  add_platform_organization_feature_adoption.sql), not a new query. */
export type OrgHealthTier = 'bronze' | 'silver' | 'gold';

/** Each consumer (StudioUsageComponent, StudioOrganizationsComponent,
 *  StudioOrgDetailComponent) renders the tier as a `.health-badge-bronze/
 *  -silver/-gold` class with its own hardcoded (not theme-derived) colors —
 *  same "duplicate the small pill, share the logic" convention
 *  `.status-badge`/severity-pill styling already follows across this app
 *  rather than a shared component, and hardcoded for the same "Studio's own
 *  console isn't org branding" reasoning StudioOrgDetailComponent's own
 *  "Retire" red already establishes: a badge needs to read the same shade
 *  of gold regardless of which THEME_PRESETS color the org being described
 *  happens to have picked for itself. Keep bronze #a0673f/silver #5f6670/
 *  gold #c99a2e (on white, except gold's dark-on-gold #2b2200) in sync
 *  across all three if this ever changes — silver was originally #8b929b
 *  (3.14:1 against white, a real WCAG AA fail at this badge's text size)
 *  until an accessibility pass darkened it to #5f6670 (5.80:1). */
export const ORG_HEALTH_TIER_LABELS: Record<OrgHealthTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold'
};

/** The five feature-adoption counts a tier is computed from — every one of
 *  these already comes back from platform_get_organization_usage(), reduced
 *  here to "adopted at all" (count > 0). Kept as a plain interface (not the
 *  RPC's own snake_case row shape) so callers don't need to know or care
 *  which raw column backs which signal. */
export interface OrgFeatureAdoption {
  containerCount: number;
  reservationCount: number;
  orderCount: number;
  broadcastCount: number;
  completedAuditCount: number;
}

/** One entry per signal, for a UI that wants to render "which features" as a
 *  checklist rather than just the rolled-up tier — mirrors
 *  INVENTORY_TABLE_COLUMN_GROUPS' own "iterate a flat option list instead of
 *  hardcoding one template block per field" shape. */
export const ORG_HEALTH_FEATURES: { key: keyof OrgFeatureAdoption; label: string }[] = [
  { key: 'containerCount', label: 'Container/box tracking' },
  { key: 'reservationCount', label: 'Reservations' },
  { key: 'orderCount', label: 'Restock orders' },
  { key: 'broadcastCount', label: 'Broadcasts' },
  { key: 'completedAuditCount', label: 'Completed an audit' }
];

/** 4-5 of 5 adopted = gold, 2-3 = silver, 0-1 = bronze. */
export function computeOrgHealthTier(adoption: OrgFeatureAdoption): OrgHealthTier {
  const adoptedCount = ORG_HEALTH_FEATURES.filter(feature => adoption[feature.key] > 0).length;
  if (adoptedCount >= 4) {
    return 'gold';
  }
  if (adoptedCount >= 2) {
    return 'silver';
  }
  return 'bronze';
}
