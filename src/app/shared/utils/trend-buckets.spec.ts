import { bucketByWeek } from './trend-buckets';

describe('bucketByWeek', () => {
  it('returns one point per requested week, oldest first', () => {
    const points = bucketByWeek([], 4);
    expect(points.length).toBe(4);
    expect(points.every(point => point.value === 0)).toBeTrue();
  });

  it('counts a timestamp into the window it actually falls in', () => {
    const now = new Date();
    const thisWeek = new Date(now);
    thisWeek.setDate(thisWeek.getDate() - 1);
    const threeWeeksAgo = new Date(now);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 25);

    const points = bucketByWeek([thisWeek.toISOString(), thisWeek.toISOString(), threeWeeksAgo.toISOString()], 4);

    expect(points[3].value).toBe(2); // most recent window, last in the oldest-first array
    expect(points[0].value).toBe(1); // oldest window
    expect(points[1].value + points[2].value).toBe(0);
  });

  it('does not drop a quiet week with zero matches', () => {
    const now = new Date();
    const points = bucketByWeek([now.toISOString()], 3);
    expect(points.length).toBe(3);
  });
});
