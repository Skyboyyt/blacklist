/**
 * Date formatting. Uses a fixed locale and UTC so server and client render the
 * same text (no hydration mismatch) and every timestamp states its time zone.
 */
const dateTime = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDateTimeUtc(iso: string): string {
  return `${dateTime.format(new Date(iso))} UTC`;
}

export function formatDateUtc(iso: string): string {
  return dateOnly.format(new Date(iso));
}
