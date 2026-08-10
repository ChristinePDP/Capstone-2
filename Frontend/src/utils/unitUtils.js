// src/utils/unitUtils.js
// ─────────────────────────────────────────────────────────────
// IISANG PINAGMUMULAN NG TOTOO (single source of truth) para sa lahat
// ng unit ng sukat sa buong app.
//
// IMPORTANT NA DISENYO — dalawang magkaibang bagay ito, huwag paghalu-
// haluin:
//
// 1. STOCK_UNIT_CATEGORIES — mga unit na PWEDENG maging INVENTORY/
//    STOCK unit ng isang raw ingredient o celebration material (kg, g,
//    L, ml, pcs, dozen, packs, boxes, atbp.). GINAGAMIT ito ng RawTab
//    at CelebrationTab (Add New / Edit Details modals).
//
//    SADYANG WALANG cups/tbsp/tsp DITO — hindi makatotohanan na i-track
//    ang STOCK bilang "500 tsp ng Baking Powder". Binibili natin ang
//    mga sangkap sa timbang (kg/g) o volume (L/ml), hindi sa bilang ng
//    kutsarita.
//
// 2. Ang UNIT CONVERSION ENGINE (convertToBase, getCompatibleUnits) —
//    ito ang ginagamit ng RecipeTab kapag nagde-declare ng recipe
//    requirement (hal. "1 tsp vanilla extract"). DITO isinama ang
//    cups/tbsp/tsp, PERO sa loob LANG ng "volume" group (kasama ng L
//    at ml) — dahil eksakto at universal ang volume-to-volume na
//    conversion nila (1 tsp = 4.92892 ml, palagi, kahit anong likido).
//    HINDI sila kasama sa "mass" group — kaya kung ang isang ingredient
//    ay naka-kg/g ang stock (pulbos/tuyo), HINDI ito mag-ooffer ng
//    tsp/tbsp/cup bilang option sa Recipe row — kailangan pa ring
//    i-type ang tunay na TIMBANG (grams), dahil doon pa rin lumalabas
//    ang density problem (magkaibang bigat ang "1 cup" ng iba't-ibang
//    pulbos).
// ─────────────────────────────────────────────────────────────

// ── STOCK/INVENTORY UNIT OPTIONS ────────────────────────────────
// Ito lang ang dapat lumabas sa Unit dropdown kapag nagda-Add/Edit ng
// Raw Ingredient o Celebration Material (RawTab.jsx, CelebrationTab.jsx).
export const STOCK_UNIT_CATEGORIES = [
  {
    label: 'Timbang (Weight)',
    units: ['kg', 'grams'],
  },
  {
    label: 'Likido (Volume)',
    units: ['Liters', 'ml'],
  },
  {
    label: 'Bilang (Counting)',
    units: ['pcs', 'dozen', 'packs', 'boxes', 'sets', 'sachets', 'bottles', 'cans', 'blocks', 'trays', 'bags'],
  },
  {
    label: 'Haba (Length)',
    units: ['meters', 'yards'],
  },
];

// Flat na listahan (walang grouping) — gamitin kung saan simpleng array
// lang ng options ang kailangan.
export const STOCK_UNIT_OPTIONS = STOCK_UNIT_CATEGORIES.flatMap(cat => cat.units);

// ── UNIT CONVERSION ENGINE ──────────────────────────────────────
// Ginagamit ito ng RecipeTab para tumugma ang recipe requirement sa
// aktwal na stock, kahit magkaiba ang paraan ng pagsukat (hal. recipe
// = "1 tsp", stock = "ml").
//
// IMPORTANT: HINDI lahat ng unit ay convertible sa isa't isa. Tanging
// mga TALAGANG universal na conversion lang ang isinama:
//   - Mass: kg <-> g
//   - Volume: L <-> ml <-> cup <-> tbsp <-> tsp (LAHAT volume, walang
//     density involved — eksakto ang conversion, kahit anong likido)
//   - Count: pcs <-> dozen
// Ang mga tulad ng "pack", "box", "set", "sachet", "tray", "bag",
// "bottle", "can", "block" ay SADYANG hindi isinama bilang convertible
// dahil nag-iiba ang laman depende sa produkto — walang universal na
// factor na ligtas gamitin.
const UNIT_ALIASES = {
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs',
  dozen: 'dozen', doz: 'dozen', dz: 'dozen',
};

// Ang factor ay "ilang LITRO katumbas ng 1 unit na ito" (para sa
// volume group) o "ilang KILO katumbas ng 1 unit na ito" (mass) —
// karaniwang US customary measures ang ginamit sa cup/tbsp/tsp,
// dahil ito ang pinaka-karaniwang ginagamit sa mga recipe sa Pilipinas.
const UNIT_GROUPS = {
  mass:   { kg: 1, g: 0.001 },
  volume: { l: 1, ml: 0.001, cup: 0.236588, tbsp: 0.0147868, tsp: 0.00492892 },
  count:  { pcs: 1, dozen: 12 },
};

export const normalizeText = (value = '') => String(value).trim().toLowerCase();
export const normalizeUnit = (unit = '') => UNIT_ALIASES[normalizeText(unit)] || normalizeText(unit);

export const getUnitGroup = (unit = '') => {
  const normalized = normalizeUnit(unit);
  return Object.entries(UNIT_GROUPS).find(([, factors]) => normalized in factors)?.[0] || null;
};

export const getCompatibleUnits = (unit = '') => {
  const normalized = normalizeUnit(unit);
  const group = getUnitGroup(normalized);
  return group ? Object.keys(UNIT_GROUPS[group]) : (normalized ? [normalized] : []);
};

/**
 * I-convert ang isang value mula sa isang unit papunta sa ibang unit —
 * GAGANA LANG kung parehong nasa SAME group ang dalawang unit (hal.
 * kg<->g, l<->ml<->tsp<->tbsp<->cup, pcs<->dozen). Kung hindi compatible
 * (hal. "boxes" papuntang "kg", o "tsp" papuntang "kg"), ibabalik ang
 * NaN — kailangan i-check ng caller.
 */
export const convertToBase = (value, fromUnit, toUnit) => {
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
};

// Static cheat-sheet para sa UI (hal. sa tabi ng Unit selector sa
// RawTab/CelebrationTab) — para mabilis makonsulta ng user ang common
// conversions nang hindi na kailangang mag-search o mag-isip.
export const UNIT_CONVERSION_HINTS = {
  kg: '1 kg = 1,000 g',
  grams: '1,000 g = 1 kg',
  Liters: '1 L = 1,000 ml',
  ml: '1,000 ml = 1 L',
  dozen: '1 dozen = 12 pcs',
  pcs: '12 pcs = 1 dozen',
};