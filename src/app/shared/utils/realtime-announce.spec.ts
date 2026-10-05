import { LiveAnnouncer } from '@angular/cdk/a11y';
import { flashAndAnnounceChanges } from './realtime-announce';
import { FlashTracker } from './flash-tracker';

describe('flashAndAnnounceChanges()', () => {
  let flashTracker: FlashTracker;
  let liveAnnouncer: jasmine.SpyObj<LiveAnnouncer>;

  beforeEach(() => {
    flashTracker = new FlashTracker();
    liveAnnouncer = jasmine.createSpyObj('LiveAnnouncer', ['announce']);
  });

  it('flashes every id regardless of whether it resolves to a label', () => {
    flashAndAnnounceChanges(['a', 'b'], flashTracker, liveAnnouncer, () => null, label => label);

    expect(flashTracker.isFlashing('a')).toBe(true);
    expect(flashTracker.isFlashing('b')).toBe(true);
  });

  it('announces a "polite" message for each id that resolves to a real label', () => {
    const labels: Record<string, string> = { 'item-1': 'Folding Chairs', 'item-2': 'Round Tables' };

    flashAndAnnounceChanges(
      Object.keys(labels),
      flashTracker,
      liveAnnouncer,
      id => labels[id] ?? null,
      label => `${label} updated`
    );

    expect(liveAnnouncer.announce).toHaveBeenCalledWith('Folding Chairs updated', 'polite');
    expect(liveAnnouncer.announce).toHaveBeenCalledWith('Round Tables updated', 'polite');
    expect(liveAnnouncer.announce).toHaveBeenCalledTimes(2);
  });

  it('skips the announcement (but still flashes) for an id with no resolvable label', () => {
    flashAndAnnounceChanges(['deleted-id'], flashTracker, liveAnnouncer, () => null, label => `${label} updated`);

    expect(flashTracker.isFlashing('deleted-id')).toBe(true);
    expect(liveAnnouncer.announce).not.toHaveBeenCalled();
  });

  it('does nothing for an empty id set', () => {
    flashAndAnnounceChanges([], flashTracker, liveAnnouncer, () => 'unused', label => label);

    expect(liveAnnouncer.announce).not.toHaveBeenCalled();
  });
});
