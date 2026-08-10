// src/utils/numberGuards.js
// ─────────────────────────────────────────────────────────────
// Iisang lugar na lang ang lahat ng "bantay" para sa number inputs
// (stock qty, minimum stock, cost). Ginagamit ito ng RawTab,
// CelebrationTab, WasteTab, at RecipeTab para consistent lahat ng
// validation — walang butas sa pagitan ng modules.
// ─────────────────────────────────────────────────────────────

// Pinakamalaking dami na puwedeng ilagay sa isang restock/add — kung
// mas malaki pa dito, malamang typo (hal. nakadagdag ng extra zero).
export const MAX_QTY = 100000;

// Pinakamalaking halaga (₱) na puwedeng ilagay sa isang transaction.
export const MAX_COST = 1000000;

// Ilang decimal places lang ang pinapayagan (tugma sa backend na
// gumagamit ng .toFixed(4) sa stock computations).
export const MAX_DECIMALS = 4;

/**
 * Linisin ang raw text mula sa isang number input habang nagta-type
 * ang user. Tinatanggal ang comma (kapag pinaste galing Excel, atbp.),
 * mga letra, at extra decimal points. Pinuputol din ang sobrang
 * decimal places.
 *
 * IMPORTANT: gamitin ito bago i-store/i-compute ang value (hal. sa
 * state, sa payload papunta sa backend). Ang RAW (unformatted) na
 * numeric string ang laging pinapanatili sa state — ang comma/₱ sign
 * ay para sa DISPLAY lang (tingnan ang formatNumberLive / formatPesoLive
 * sa ibaba), hindi dapat isama sa stored value.
 */
export function sanitizeNumericText(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';

  let value = String(raw).replace(/,/g, ''); // alisin comma separators
  value = value.replace(/[^0-9.]/g, '');      // letra/simbolo -> tanggal

  // isang decimal point lang ang pinapayagan
  const parts = value.split('.');
  if (parts.length > 2) {
    value = parts[0] + '.' + parts.slice(1).join('');
  }

  const [intPart, decPart] = value.split('.');
  if (decPart !== undefined && decPart.length > MAX_DECIMALS) {
    value = `${intPart}.${decPart.slice(0, MAX_DECIMALS)}`;
  }

  return value;
}

/** Ipakita ang number na may thousands separator, hal. 12345.5 -> "12,345.5" */
export function formatWithCommas(value) {
  if (value === '' || value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return '';

  const [intPart, decPart] = String(value).split('.');
  const withCommas = Number(intPart || 0).toLocaleString('en-US');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

/**
 * Katulad ng formatWithCommas, pero ginawa para sa LIVE na pag-format
 * habang nagta-type ang user sa loob mismo ng input field (hindi lang
 * sa ibang preview line sa ilalim). Pinapanatili ang trailing "." at
 * mga decimal digit habang tino-type — hal. "12345." ay nananatiling
 * "12,345." (hindi basta nawawala ang tuldok), at "12345.5" ay
 * nagiging "12,345.5".
 */
export function formatNumberLive(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';

  const str = String(raw);
  const hasTrailingDot = str.endsWith('.') && !str.slice(0, -1).includes('.');
  const [intPart, decPart] = str.split('.');

  const withCommas = intPart === '' ? '0' : Number(intPart).toLocaleString('en-US');

  if (decPart !== undefined) {
    return `${withCommas}.${decPart}`;
  }
  return hasTrailingDot ? `${withCommas}.` : withCommas;
}

/**
 * Modern na "peso input" formatting — may ₱ sign PLUS comma separators,
 * live habang nagta-type. Halimbawa: "12345.5" -> "₱12,345.5"
 * Ginagamit ito bilang DISPLAY value ng cost/halaga input fields.
 */
export function formatPesoLive(raw) {
  const formatted = formatNumberLive(raw);
  return formatted === '' ? '' : `₱${formatted}`;
}

/**
 * I-alis ang ₱ sign at comma separators mula sa isang display string
 * (hal. "₱12,345.5") para makuha ulit ang raw numeric text na puwedeng
 * i-sanitize/i-store. Gamitin ito sa onChange ng peso-formatted inputs
 * bago tawagin ang sanitizeNumericText.
 */
export function parseFormattedPeso(displayValue) {
  if (!displayValue) return '';
  return String(displayValue).replace(/[₱,\s]/g, '');
}

/**
 * I-check kung sobra na sa limitasyon ang nilagay na number.
 * Ibinabalik ang error message (string) kapag may problema,
 * o null kapag okay naman.
 */
export function getQtyError(value, { max = MAX_QTY, label = 'Quantity' } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return `Invalid number for ${label.toLowerCase()}.`;
  if (num < 0) return `${label} can't be negative.`;
  if (num > max) {
    return `${label} is too large (max ${formatWithCommas(max)}). Baka may extra zero na naidagdag — paki-check.`;
  }
  return null;
}

export function getCostError(value, { max = MAX_COST } = {}) {
  return getQtyError(value, { max, label: 'Cost' });
}

// ─────────────────────────────────────────────────────────────
// FRACTION-AWARE QUANTITY INPUT
// Para sa mga sitwasyon tulad ng "magre-restock lang ako ng 1/4 kilo"
// — huwag nang kalkulahin sa ulo ang 1/4 = 0.25. Puwede nang i-type
// nang direkta ang "1/4" o "1 1/2" (mixed number), at awtomatikong
// mako-convert sa tamang decimal.
//
// PAANO GAMITIN: gamitin ang sanitizeQtyText sa onChange (habang
// nagta-type, pinapayagan pa rin ang "/" character), tapos tawagin
// ang parseFractionInput sa onBlur (paglabas sa field) para i-finalize
// bilang plain decimal. Tingnan ang halimbawa sa ibaba ng file na ito.
// ─────────────────────────────────────────────────────────────

/**
 * Katulad ng sanitizeNumericText, pero pinapayagan din ang isang "/"
 * at isang space (para sa mixed number tulad ng "1 1/2") habang
 * tino-type pa lang ng user. HINDI pa ito ang panghuling value —
 * dapat i-finalize gamit ang parseFractionInput bago i-store/i-compute.
 */
export function sanitizeQtyText(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';

  let value = String(raw).replace(/,/g, '');
  // digits, isang decimal point, isang "/", at space lang ang pinapayagan
  value = value.replace(/[^0-9./ ]/g, '');

  // huwag payagan ang dalawa o higit pang "/" o "."
  const slashCount = (value.match(/\//g) || []).length;
  if (slashCount > 1) {
    value = value.replace(/\/(?=.*\/)/, '');
  }
  const dotCount = (value.match(/\./g) || []).length;
  if (dotCount > 1) {
    const firstDot = value.indexOf('.');
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
  }

  return value;
}

/**
 * I-convert ang isang fraction o mixed-number string papuntang plain
 * decimal string. Kung plain decimal na ang laman (walang "/"),
 * ibinabalik lang ito na naka-sanitize.
 *
 * Suportado:
 *   "1/4"    -> "0.25"
 *   "3/4"    -> "0.75"
 *   "1 1/2"  -> "1.5"
 *   "0.25"   -> "0.25" (walang binago, dumaan lang sa sanitizeNumericText)
 *
 * Kung invalid ang fraction (hal. "1/0"), ibinabalik ang orihinal na
 * sanitized text na hindi na-convert, para sa getQtyError na lang
 * mag-flag ng error.
 */
export function parseFractionInput(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const str = String(raw).trim();

  // "1 1/2" — mixed number (buong number + fraction)
  const mixedMatch = str.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const [, whole, num, den] = mixedMatch;
    const denominator = parseFloat(den);
    if (denominator === 0) return sanitizeNumericText(str);
    const result = parseFloat(whole) + parseFloat(num) / denominator;
    return String(+result.toFixed(MAX_DECIMALS));
  }

  // "1/4" — simpleng fraction
  const fractionMatch = str.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const [, num, den] = fractionMatch;
    const denominator = parseFloat(den);
    if (denominator === 0) return sanitizeNumericText(str);
    const result = parseFloat(num) / denominator;
    return String(+result.toFixed(MAX_DECIMALS));
  }

  // Wala namang "/" — plain decimal na lang, dumaan sa normal sanitizer
  return sanitizeNumericText(str);
}

// ─────────────────────────────────────────────────────────────
// UNIT CONVERSION CHEAT-SHEET
// Static reference lang ito para sa UI (hal. sa tabi ng Unit selector)
// — HINDI ito gumagawa ng automatic na conversion sa pagitan ng units,
// dahil isang fixed unit lang dapat ang ginagamit kada item magpakailanman.
// Nandito lang para MABILIS ikonsulta ng user kung kailangan niyang
// mano-manong i-convert (hal. binili niya sa grams pero ang item niya
// ay naka-set sa "kg").
// ─────────────────────────────────────────────────────────────
// NOTE: UNIT_CONVERSION_HINTS ay nailipat na sa utils/unitUtils.js —
// doon na rin nakatira ang buong listahan ng units at ang unit
// conversion engine, para iisa lang ang totoong pinagmumulan ng mga
// ito sa buong app (ginagamit ng RawTab, CelebrationTab, at RecipeTab).