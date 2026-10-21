/**
 * TroyStack - The purchase date a holding carries to the cloud
 *
 * Supabase's purchase_date is a Postgres date, so a value that isn't a real
 * calendar day, like 2026-02-30 from a misread receipt, fails the whole
 * insert with error 22008. One such holding would stop every later sync for
 * that account, so a date that isn't real goes up as null and the holding
 * still syncs. Nothing here imports React Native, so it runs under
 * `node --test`.
 */

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function isRealDay(y, m, d) {
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  // Day 0 of the next month is the last day of this one.
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * YYYY-MM-DD for a real calendar day between 1900 and 2100, else null.
 * A YYYY-MM-DD string is checked as written and never rolled over to another
 * day. Any other string goes through Date and keeps its local calendar day.
 */
export function purchaseDateForCloud(dateStr) {
  if (typeof dateStr !== 'string' || dateStr.trim() === '') return null;
  const str = dateStr.trim();

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isRealDay(y, m, d) ? str : null;
  }

  const date = new Date(str);
  if (isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  return `${y}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
