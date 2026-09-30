import MultiImageField from './MultiImageField';
import {
  getMultiImageFields,
  getSlipValue,
  setSlipValue,
  pruneEmptySlipAnswers,
} from './orderSlipUploads';

// -----------------------------------------------------------------------------
// CartSlipImages
// -----------------------------------------------------------------------------
// Ipinapakita ang mga larawang na-attach sa Multi-image order slip fields ng
// isang cart item — puwedeng i-view, palitan, at i-delete (o dagdagan hanggang
// sa limit). Ginagamit sa online ordering cart (Menu.jsx), POS cart
// (posCart.jsx), at read-only sa order summary/checkout.
//
// Props:
//  - item: cart item (kailangan ang order_slip_details at order_slip_fields /
//          products / package_components para malaman ang max at labels)
//  - onChange: (nextOrderSlipDetails) => void   — hindi kailangan kung readOnly
//  - readOnly: boolean — thumbnails + view lang, walang palit/delete
// -----------------------------------------------------------------------------
export default function CartSlipImages({ item, onChange, readOnly = false, className = '' }) {
  const fields = getMultiImageFields(item);
  if (fields.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {fields.map((f) => {
        const files = getSlipValue(item.order_slip_details, f.path);
        const list = Array.isArray(files) ? files : [];
        const label = f.group ? `${f.group} — ${f.label}` : f.label;

        if (readOnly) {
          if (list.length === 0) return null;
        }

        return (
          <MultiImageField
            key={f.path.join('/')}
            label={label}
            value={list}
            max={f.max}
            compact
            readOnly={readOnly}
            error={!readOnly && !f.optional && list.length === 0}
            onChange={(next) => {
              if (readOnly || !onChange) return;
              onChange(setSlipValue(item.order_slip_details, f.path, next));
            }}
          />
        );
      })}
    </div>
  );
}

export { pruneEmptySlipAnswers };