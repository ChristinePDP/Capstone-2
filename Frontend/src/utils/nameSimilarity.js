const normalizeName = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const normalizeExactName = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();

export function findExactNameMatch(value, items = [], { excludeId } = {}) {
  const normalized = normalizeExactName(value);
  if (!normalized) return null;
  return items.find(item =>
    (excludeId == null || String(item.id) !== String(excludeId)) &&
    normalizeExactName(item.name) === normalized
  ) ?? null;
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

// Deliberately conservative: this only surfaces a non-blocking warning for
// close spellings. It does not use substring matching, so "brown sugar" and
// "sugar syrup" remain distinct from "sugar".
export function getSimilarNameSuggestions(value, items = [], { excludeId, limit = 3 } = {}) {
  const normalized = normalizeName(value);
  if (normalized.length < 4) return [];

  return items
    .filter(item => excludeId == null || String(item.id) !== String(excludeId))
    .map(item => ({ item, normalized: normalizeName(item.name) }))
    .filter(candidate => candidate.normalized.length >= 4)
    .map(candidate => ({
      name: candidate.item.name,
      distance: editDistance(normalized, candidate.normalized),
      maxLength: Math.max(normalized.length, candidate.normalized.length),
    }))
    .filter(candidate => candidate.distance <= (candidate.maxLength <= 7 ? 1 : candidate.maxLength <= 18 ? 2 : 3))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(candidate => candidate.name);
}
