import { zonedTimeToUtc } from 'date-fns-tz';

const ZONE = 'Australia/Melbourne';

export function windowEndFor(periodCode: string) {
  const [y, m] = periodCode.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const year = m === 12 ? y + 1 : y;
  const localEnd = new Date(Date.UTC(year, nextMonth - 1, 7, 23, 59, 59));
  return zonedTimeToUtc(localEnd, ZONE);
}

export function isWithinEditWindow(periodCode: string, now = new Date()) {
  const end = windowEndFor(periodCode);
  return now <= end;
}
