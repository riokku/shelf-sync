import { computeOrgHealthTier, OrgFeatureAdoption } from './org-health';

function buildAdoption(overrides: Partial<OrgFeatureAdoption> = {}): OrgFeatureAdoption {
  return {
    containerCount: 0,
    reservationCount: 0,
    orderCount: 0,
    broadcastCount: 0,
    completedAuditCount: 0,
    ...overrides
  };
}

describe('computeOrgHealthTier', () => {
  it('is bronze when nothing has been adopted', () => {
    expect(computeOrgHealthTier(buildAdoption())).toBe('bronze');
  });

  it('is bronze with exactly one feature adopted', () => {
    expect(computeOrgHealthTier(buildAdoption({ reservationCount: 5 }))).toBe('bronze');
  });

  it('is silver with two features adopted', () => {
    expect(computeOrgHealthTier(buildAdoption({ reservationCount: 5, orderCount: 1 }))).toBe('silver');
  });

  it('is silver with three features adopted', () => {
    expect(
      computeOrgHealthTier(buildAdoption({ reservationCount: 5, orderCount: 1, broadcastCount: 2 }))
    ).toBe('silver');
  });

  it('is gold with four features adopted', () => {
    expect(
      computeOrgHealthTier(
        buildAdoption({ reservationCount: 5, orderCount: 1, broadcastCount: 2, containerCount: 3 })
      )
    ).toBe('gold');
  });

  it('is gold with every feature adopted', () => {
    expect(
      computeOrgHealthTier({
        containerCount: 3,
        reservationCount: 5,
        orderCount: 1,
        broadcastCount: 2,
        completedAuditCount: 1
      })
    ).toBe('gold');
  });
});
