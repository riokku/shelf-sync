-- pricing_tier_limits() (add_pricing_tier_usage_limits) hardcodes the same
-- numbers PRICING_TIERS defines in src/app/shared/models/pricing-tier.ts,
-- "deliberately duplicated rather than shared" per that migration's own
-- comment, which also warns: "If PRICING_TIERS' own numbers ever change,
-- this function needs updating to match by hand." Free's/Basic's own seat
-- counts moved from 3/10 to 8/20 there without this follow-up, so
-- admin_approve_member() kept rejecting a Free org's 4th approval against
-- the old cap of 3 even though the UI/pricing page already advertised 8.
create or replace function public.pricing_tier_limits(p_tier text)
returns table (max_items integer, max_members integer, storage_limit_mb integer)
language sql
immutable
as $$
  select
    case p_tier when 'pro' then null::integer when 'basic' then 1000 else 100 end,
    case p_tier when 'pro' then null::integer when 'basic' then 20 else 8 end,
    case p_tier when 'basic' then 5000 when 'pro' then 25000 else 500 end;
$$;
