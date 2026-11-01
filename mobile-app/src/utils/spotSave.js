// What the add and edit form saves for the spot at purchase and the premium.
// A spot of 0 means the holding has no recorded spot, which is how every
// screen already reads it. The form works the premium out from the spot,
// so when the spot is cleared before saving, the premium worked out from the
// old spot would otherwise save with no spot behind it. That premium is
// dropped. A premium the user typed themselves is kept as typed.
// Nothing here imports React Native, so it runs under `node --test`.

// A blank, zero, negative or unreadable spot saves as 0, meaning no spot.
export const spotForSave = (spot) => {
  const value = parseFloat(spot);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

// premium is what the form's premium field holds now. premiumFromSpot is the
// value the form last worked out from a spot, or undefined when it hasn't.
export const premiumForSave = ({ spot, premium, premiumFromSpot }) => {
  const value = parseFloat(premium);
  const typed = Number.isFinite(value) ? value : 0;
  if (spotForSave(spot) > 0) return typed;
  const derived = premiumFromSpot !== undefined && String(premium ?? '').trim() === String(premiumFromSpot).trim();
  return derived ? 0 : typed;
};
