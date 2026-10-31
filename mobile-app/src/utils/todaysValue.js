/**
 * TroyStack - "Not sure what you paid?" on the add form
 *
 * Plenty of new users own coins they bought years ago and can't recall the
 * price. Unit Price is required, so they stall on the one field that doesn't
 * change what their stack is worth today. This offers today's melt value per
 * unit as the price, clearly labeled as such, so the holding saves with a
 * cost basis equal to its value now and its gain starts at zero. It only
 * offers a number when the spot price is live from the API, never the
 * placeholder spot the app opens with, and only on a new add with no price
 * typed yet. Each metal needs its own price from the latest fetch, since one
 * the API left out keeps the placeholder or an old cached price. Nothing here imports React Native, so it runs under `node --test`.
 */

/**
 * Today's melt value of one unit, as the add form's price string, or null
 * when the app can't offer an honest one.
 *
 * @param {object} args
 * @param {string|number} args.ozt   Fine troy ounces per unit, as typed.
 * @param {number} args.spot         The metal's spot price per troy ounce.
 * @param {boolean} args.live        Whether the spot came from a live fetch.
 * @returns {string|null}            Dollars to two places, like "77.25".
 */
export function todaysUnitValue({ ozt, spot, live }) {
  if (!live) return null;
  const weight = typeof ozt === 'number' ? ozt : parseFloat(String(ozt ?? '').trim());
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (typeof spot !== 'number' || !Number.isFinite(spot) || spot <= 0) return null;
  const cents = Math.round(weight * spot * 100);
  if (cents <= 0) return null;
  return (cents / 100).toFixed(2);
}

/** A date as the add form's YYYY-MM-DD, in the phone's own time zone. */
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whether the add form offers today's value: a new add (not an edit of a
 * holding, a scanned item or an imported row) with no positive price typed,
 * and no purchase date or today's. A past date sets that day's spot on the
 * form, and today's value against it would save as a made-up premium, so a
 * dated purchase is left to its real price.
 */
export function offersTodaysValue(form, { editing, today }) {
  if (editing) return false;
  const date = String(form?.datePurchased ?? '').trim();
  if (date && date !== today) return false;
  const price = parseFloat(String(form?.unitPrice ?? '').trim());
  return !(Number.isFinite(price) && price > 0);
}

/**
 * The add form with today's value taken as the price. The spot at purchase
 * becomes today's spot so the auto premium works out to nothing, and a total
 * typed earlier is cleared so the cost basis follows the new price.
 */
export function applyTodaysValue(form, { value, spot }) {
  return { ...form, unitPrice: value, spotPrice: String(spot), premium: '0', costBasis: '' };
}
