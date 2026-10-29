export function getBundleDeleteImpact(bundle) {
  if (!bundle) return '';

  const isPackage = bundle.category === 'Package';
  const entity = isPackage ? 'Package' : 'Bundle';
  const components = isPackage
    ? (bundle.package_items || []).map(item => item.product?.name || item.name).filter(Boolean)
    : (bundle.products || []).map(product => product.name).filter(Boolean);
  const componentDetails = components.length
    ? `It contains ${components.length} product${components.length === 1 ? '' : 's'}: ${components.join(', ')}. Deleting the ${entity.toLowerCase()} will not delete those products. `
    : `Deleting the ${entity.toLowerCase()} will not delete its component products. `;
  const orderDetails = isPackage
    ? 'Existing order records and their saved package name will remain, but the package reference will no longer resolve.'
    : 'Past order items and their saved bundle name will remain, but the bundle link will be cleared.';

  return `${componentDetails}${orderDetails} This cannot be undone.`;
}
