import { TrendPoint } from '../components/trend-chart/trend-chart.component';

/** Buckets a list of ISO timestamps (e.g. organizations.created_at) into
 *  `weeks` consecutive 7-day windows ending today, oldest first —
 *  including a week with zero matching timestamps, so a sparkline never
 *  silently skips a quiet week the way filtering empty buckets out would.
 *  A plain client-side reduce, same "no server-side aggregation, org sizes
 *  here make this cheap enough" reasoning ManageReportsComponent's own
 *  groupByValue() already follows for its breakdown rows. */
export function bucketByWeek(timestamps: string[], weeks: number): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const value = timestamps.filter(ts => {
      const date = new Date(ts);
      return date > start && date <= end;
    }).length;

    points.push({ label: formatWeekStart(start), value });
  }

  return points;
}

function formatWeekStart(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
