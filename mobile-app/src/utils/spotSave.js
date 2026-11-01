// What the add and edit form saves for the spot at purchase and the premium.
// A spot of 0 means the holding has no recorded spot, which is how every
// screen already reads it. The form works the premium out from the spot,
// so when the spot is cleared before saving, the premium worked out from the
// old spot would otherwise save with no spot behind it. That premium is
// dropped, and the form saves the premium it held before a spot first worked
// one out, such as one the user typed or the holding already had.
// Nothing here imports React Native, so it runs under `node --test`.

// A blank, zero, negative or unreadable spot saves as 0, meaning no spot.
export const spotForSave = (spot) => {
  const value = parseFloat(spot);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const amount = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

// The form after the premium is worked out from its spot. premiumFromSpot
// marks the worked-out value. premiumBeforeSpot keeps what the field held
// before the first one, so clearing the spot can give it back.
export const formWithSpotPremium = (form, premium) => ({
  ...form,
  premium,
  premiumFromSpot: premium,
  premiumBeforeSpot: form.premiumFromSpot === undefined ? form.premium : form.premiumBeforeSpot,
});

// The premium fields for a form opened on a saved or scanned holding. One with
// a recorded spot had its premium worked out from that spot, so clearing the
// spot gives back no premium rather than that one.
export const openedPremium = (spotPrice, premium) => {
  const value = String(premium ?? 0);
  return spotForSave(spotPrice) > 0
    ? { premium: value, premiumFromSpot: value, premiumBeforeSpot: '0' }
    : { premium: value };
};

// The form after the user types a premium, which is theirs from then on.
export const formWithTypedPremium = (form, premium) => ({
  ...form,
  premium,
  premiumFromSpot: undefined,
  premiumBeforeSpot: undefined,
});

// The premium from before the spot as the field shows it, or '0' when there
// was none or it can't be read.
const givenBack = (value) => (Number.isFinite(parseFloat(value)) ? String(value).trim() : '0');

// The form after its spot changes. Once the spot is cleared while the premium
// is still the one worked out from it, the field shows what would save: the
// premium from before the spot, or 0. The marks go with it, so a new spot
// works its premium out over the given-back one. Any other form comes back
// as the same object, so React skips the render.
export const formAfterSpotCleared = (form) => {
  if (spotForSave(form.spotPrice) > 0 || form.premiumFromSpot === undefined) return form;
  const derived = String(form.premium ?? '').trim() === String(form.premiumFromSpot).trim();
  return {
    ...form,
    premium: derived ? givenBack(form.premiumBeforeSpot) : form.premium,
    premiumFromSpot: undefined,
    premiumBeforeSpot: undefined,
  };
};

// The premium to save from the form's spotPrice, premium, premiumFromSpot
// and premiumBeforeSpot.
export const premiumForSave = ({ spotPrice, premium, premiumFromSpot, premiumBeforeSpot }) => {
  if (spotForSave(spotPrice) > 0) return amount(premium);
  const derived = premiumFromSpot !== undefined && String(premium ?? '').trim() === String(premiumFromSpot).trim();
  return derived ? amount(premiumBeforeSpot) : amount(premium);
};

// The form after its unit price, spot or weight changes, which is the auto
// premium step App.js runs. With all three above 0 the premium is worked out
// as the unit price less the spot times the weight, never below 0, since a
// negative one means the spot is likely wrong. With no spot the premium that
// saves comes back through formAfterSpotCleared. Anything else leaves the form
// as it was, the same object.
export const formAfterPriceChange = (form) => {
  const unitPrice = parseFloat(form.unitPrice) || 0;
  const spotPrice = parseFloat(form.spotPrice) || 0;
  const ozt = parseFloat(form.ozt) || 0;
  if (unitPrice > 0 && spotPrice > 0 && ozt > 0) {
    return formWithSpotPremium(form, Math.max(0, unitPrice - spotPrice * ozt).toFixed(2));
  }
  if (spotPrice <= 0) return formAfterSpotCleared(form);
  return form;
};
