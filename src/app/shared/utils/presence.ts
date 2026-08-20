/** How stale profiles.last_active_at can be before a member reads as
 *  "offline" rather than "online now" — comfortably wider than
 *  AuthService's own 60s heartbeat interval to absorb a missed tick
 *  (network hiccup, a backgrounded/throttled browser tab slowing its own
 *  timers) without a false-negative flicker between online/offline. This
 *  is inherently an approximation, same as every app that infers presence
 *  from a heartbeat rather than a live socket connection (Slack, GitHub,
 *  etc.) — "online" here means "was active recently", not "has an open
 *  connection right now". */
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

/** Whether a profile's last_active_at falls within ONLINE_THRESHOLD_MS of
 *  now. `null` (never recorded — a pre-existing row that hasn't signed in
 *  since this shipped, or genuinely never has) is always offline. */
export function isProfileOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) {
    return false;
  }
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS;
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Picks the coarsest unit that still reads as at least 1 — matches how
 *  most apps phrase "last seen" (a rounded "3 hours ago" rather than a
 *  precise duration), and keeps the string short regardless of how long
 *  ago it was. */
function pickRelativeUnit(diffMs: number): [value: number, unit: Intl.RelativeTimeFormatUnit] {
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return [minutes, 'minute'];
  }
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) {
    return [hours, 'hour'];
  }
  const days = Math.round(diffMs / 86_400_000);
  if (days < 30) {
    return [days, 'day'];
  }
  const months = Math.round(diffMs / (86_400_000 * 30));
  if (months < 12) {
    return [months, 'month'];
  }
  const years = Math.round(diffMs / (86_400_000 * 365));
  return [years, 'year'];
}

/** "Last seen <relative time>" for a profile that isn't currently online —
 *  callers are expected to check isProfileOnline() first and only show
 *  this for the offline case (see ManageTeamComponent). */
export function formatLastSeen(lastActiveAt: string | null): string {
  if (!lastActiveAt) {
    return 'Never signed in';
  }
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  if (diffMs < 45_000) {
    return 'Last seen just now';
  }
  const [value, unit] = pickRelativeUnit(diffMs);
  return `Last seen ${relativeTimeFormatter.format(-value, unit)}`;
}
