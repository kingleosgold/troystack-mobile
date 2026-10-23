/**
 * TroyStack - Quick picks on the add form
 *
 * A new user adding their first holding shouldn't have to type a product name
 * and look up its weight. Each metal gets a short row of the bullion people
 * most often own, and a tap fills the product name, the fine troy ounces per
 * unit and a quantity of 1, so the price is the only thing left to type. The
 * weights are the fine metal each piece holds, which for these coins and bars
 * is the weight on the label. A pick never touches the price, dealer, date or
 * any cost field, so a holding's cost basis is always what the user entered.
 * Nothing here imports React Native, so it runs under `node --test`.
 */

// One kilo is 1000 g over 31.1034768 g per troy ounce, to four places.
const KILO_OZT = 32.1507;

export const QUICK_PICKS = {
  silver: [
    { label: 'Silver Eagle', productName: 'American Silver Eagle', ozt: 1 },
    { label: 'Silver Maple', productName: 'Canadian Silver Maple Leaf', ozt: 1 },
    { label: '1 oz bar', productName: '1 oz Silver Bar', ozt: 1 },
    { label: '10 oz bar', productName: '10 oz Silver Bar', ozt: 10 },
    { label: '100 oz bar', productName: '100 oz Silver Bar', ozt: 100 },
    { label: 'Kilo bar', productName: '1 Kilo Silver Bar', ozt: KILO_OZT },
  ],
  gold: [
    { label: 'Gold Eagle', productName: 'American Gold Eagle', ozt: 1 },
    { label: 'Gold Buffalo', productName: 'American Gold Buffalo', ozt: 1 },
    { label: 'Gold Maple', productName: 'Canadian Gold Maple Leaf', ozt: 1 },
    { label: '1 oz bar', productName: '1 oz Gold Bar', ozt: 1 },
    { label: '1/10 oz Eagle', productName: '1/10 oz American Gold Eagle', ozt: 0.1 },
  ],
  platinum: [
    { label: 'Platinum Eagle', productName: 'American Platinum Eagle', ozt: 1 },
    { label: '1 oz bar', productName: '1 oz Platinum Bar', ozt: 1 },
  ],
  palladium: [
    { label: 'Palladium Maple', productName: 'Canadian Palladium Maple Leaf', ozt: 1 },
    { label: '1 oz bar', productName: '1 oz Palladium Bar', ozt: 1 },
  ],
};

/** The picks for a metal, or none for anything else. */
export function quickPicksFor(metal) {
  return QUICK_PICKS[metal] || [];
}

/**
 * The add form with a pick applied. It sets the product name and ozt, and a
 * quantity of 1 only when none is typed yet, so a quantity already entered
 * stays. Every other field comes through as it was.
 */
export function applyQuickPick(form, pick) {
  const quantity = String(form.quantity ?? '').trim();
  return {
    ...form,
    productName: pick.productName,
    ozt: String(pick.ozt),
    quantity: quantity && parseInt(quantity, 10) > 0 ? form.quantity : '1',
  };
}

/** Whether the form shows this pick as chosen. */
export function isQuickPickChosen(form, pick) {
  return form.productName === pick.productName && form.ozt === String(pick.ozt);
}
