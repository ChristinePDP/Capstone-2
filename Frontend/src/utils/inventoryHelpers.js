export function ingStatus(stock, min) {
  if (stock < min * 2) return { cls: 'danger', label: 'Low' };
  return { cls: 'success', label: 'Enough' };
}

export function computeCapacity(recipe, ingredients) {
  let maxBatches = Infinity;
  const shortfalls = [];

  for (const ri of recipe.ingredients) {
    const ing = ingredients.find(i => i.name === ri.name);
    const available = ing ? ing.stock : 0;
    const batchesPossible = ri.qty > 0 ? Math.floor(available / ri.qty) : Infinity;
    if (batchesPossible < maxBatches) maxBatches = batchesPossible;
    if (!ing || available < ri.qty) {
      shortfalls.push({ name: ri.name, available, needed: ri.qty, unit: ri.unit });
    }
  }

  const maxUnits = isFinite(maxBatches) ? maxBatches * recipe.yield : 0;
  return { maxBatches: isFinite(maxBatches) ? maxBatches : 0, maxUnits, shortfalls };
}

export function computeShoppingList(recipe, quota, ingredients) {
  const batchesNeeded = Math.ceil(quota / recipe.yield);
  const list = [];

  for (const ri of recipe.ingredients) {
    const ing = ingredients.find(i => i.name === ri.name);
    const totalNeeded = +(ri.qty * batchesNeeded).toFixed(4);
    const available   = ing ? +ing.stock.toFixed(4) : 0;
    const toBuy       = +(Math.max(0, totalNeeded - available)).toFixed(4);
    list.push({ name: ri.name, unit: ri.unit, totalNeeded, available, toBuy, sufficient: toBuy === 0 });
  }

  return { batchesNeeded, list };
}