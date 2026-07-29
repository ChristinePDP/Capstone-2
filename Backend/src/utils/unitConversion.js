// backend/utils/unitConversion.js
// ─────────────────────────────────────────────────────────────
// Backend version ng unit-conversion logic (tugma sa
// Frontend/src/utils/unitUtils.js). Kailangan ito rito dahil DITO
// nangyayari ang totoong pagbawas ng stock (production deductions,
// waste, atbp.) — hindi puwedeng umasa lang sa frontend na palaging
// tama ang unit na ipinapasa, dapat may proteksyon din sa backend.
//
// IMPORTANT: HINDI lahat ng unit convertible sa isa't isa. Tanging
// mga TALAGANG universal na conversion lang (kg<->g, L<->ml,
// pcs<->dozen) ang sinusuportahan. Ang packs/boxes/sets/atbp. ay
// SADYANG hindi convertible (iba-iba ang laman depende sa produkto).
// ─────────────────────────────────────────────────────────────

const UNIT_ALIASES = {
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs',
  dozen: 'dozen', doz: 'dozen', dz: 'dozen',
};

const UNIT_GROUPS = {
  mass:   { kg: 1, g: 0.001 },
  volume: { l: 1, ml: 0.001 },
  count:  { pcs: 1, dozen: 12 },
};

const normalizeText = (value = '') => String(value).trim().toLowerCase();
const normalizeUnit = (unit = '') => UNIT_ALIASES[normalizeText(unit)] || normalizeText(unit);

const getUnitGroup = (unit = '') => {
  const normalized = normalizeUnit(unit);
  return Object.entries(UNIT_GROUPS).find(([, factors]) => normalized in factors)?.[0] || null;
};

/**
 * I-convert ang isang value mula sa isang unit papunta sa ibang unit.
 * Ibinabalik ang NaN kung hindi compatible ang dalawang unit (hal.
 * "boxes" papuntang "kg") — SADYANG hindi nag-aassume, dapat i-check
 * ng caller kung NaN ang resulta bago ituloy ang operation.
 */
function convertUnit(value, fromUnit, toUnit) {
  const amount = Number(value);
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!Number.isFinite(amount)) return NaN;
  if (!from || !to || from === to) return amount;

  const group = getUnitGroup(from);
  if (!group || group !== getUnitGroup(to)) return NaN;

  const factors = UNIT_GROUPS[group];
  if (!(from in factors) || !(to in factors)) return NaN;
  return amount * (factors[from] / factors[to]);
}

export { convertUnit, normalizeUnit };