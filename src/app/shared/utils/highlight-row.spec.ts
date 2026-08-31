import { fakeAsync, tick } from '@angular/core/testing';
import { flashAndScrollToHighlighted } from './highlight-row';
import { FlashTracker } from './flash-tracker';

describe('flashAndScrollToHighlighted', () => {
  // A dedicated container, not document.body directly — Karma's own test
  // runner UI lives in the body too, so clearing/appending to the body
  // itself risks corrupting it between tests.
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('does nothing when highlightId is null', fakeAsync(() => {
    const flashTracker = new FlashTracker();
    flashAndScrollToHighlighted(null, ['a', 'b'], id => `row-${id}`, flashTracker);
    tick();

    expect(flashTracker.isFlashing('a')).toBeFalse();
  }));

  it('does nothing when highlightId doesn\'t match anything in ids (stale/tampered link, or the row was deleted)', fakeAsync(() => {
    const flashTracker = new FlashTracker();
    flashAndScrollToHighlighted('missing', ['a', 'b'], id => `row-${id}`, flashTracker);
    tick();

    expect(flashTracker.isFlashing('missing')).toBeFalse();
  }));

  it('flashes the matching id and scrolls its element into view', fakeAsync(() => {
    const flashTracker = new FlashTracker();
    const row = document.createElement('div');
    row.id = 'row-a';
    const scrollSpy = spyOn(row, 'scrollIntoView');
    container.appendChild(row);

    flashAndScrollToHighlighted('a', ['a', 'b'], id => `row-${id}`, flashTracker);
    expect(flashTracker.isFlashing('a')).toBeFalse(); // deferred, not synchronous

    tick();

    expect(flashTracker.isFlashing('a')).toBeTrue();
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  }));

  it('is a no-op (not a throw) when the matching id has no corresponding element yet', fakeAsync(() => {
    const flashTracker = new FlashTracker();
    flashAndScrollToHighlighted('a', ['a'], id => `row-${id}`, flashTracker);

    expect(() => tick()).not.toThrow();
    expect(flashTracker.isFlashing('a')).toBeTrue();
  }));
});
