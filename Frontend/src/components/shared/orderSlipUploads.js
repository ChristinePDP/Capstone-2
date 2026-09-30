// orderSlipUploads.js
// -----------------------------------------------------------------------------
// Shared helpers para sa mga larawang nasa loob ng `order_slip_details`
// (Multi-image order slip fields). Ginagamit ng Checkout.jsx (online) at
// posCart.jsx (POS) bago buuin ang order payload, at ng Menu.jsx / posMenu.jsx
// para sa cart-merge check.
//
// Hugis ng data:
//   Sa cart (bago mag-place ng order):
//     order_slip_details = { "Size": "4x6", "Tarp Photos": [File, File] }
//     (bundle/package: { [productId]: { "Tarp Photos": [File, File] } })
//   Pagkatapos i-upload (papunta sa backend / DB, JSONB):
//     order_slip_details = { "Size": "4x6", "Tarp Photos": ["https://...", "https://..."] }
// Walang DB migration na kailangan — JSONB na ang column.
// -----------------------------------------------------------------------------

const UPLOAD_ENDPOINT = () => `${import.meta.env.VITE_API_URL}/online-ordering/upload-inspiration`;

const isBlob = (v) => typeof Blob !== 'undefined' && v instanceof Blob;

export const IMAGE_URL_RE = /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(\?.*)?$/i;
export const isImageUrl = (v) => typeof v === 'string' && IMAGE_URL_RE.test(v);
export const isImageUrlList = (v) => Array.isArray(v) && v.length > 0 && v.every(isImageUrl);

// Nag-a-upload ng isang File sa dati ring endpoint na ginagamit ng reference
// image. Nagta-throw kapag pumalya (para hindi mailagay ang order nang kulang
// ang larawan nang walang nakakaalam).
export async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(UPLOAD_ENDPOINT(), { method: 'POST', body: formData });
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  if (!res.ok || !data?.success || !data?.url) {
    throw new Error(`Hindi na-upload ang larawang "${file.name || 'image'}". Subukan ulit.`);
  }
  return data.url;
}

// True kung may natitirang File kahit saan sa loob ng slip (nested din).
export function slipHasFiles(value) {
  if (isBlob(value)) return true;
  if (Array.isArray(value)) return value.some(slipHasFiles);
  if (value && typeof value === 'object') return Object.values(value).some(slipHasFiles);
  return false;
}

// Nilalakad ang buong order_slip_details at pinapalitan ang bawat File ng URL
// pagkatapos i-upload. Ibinabalik ang BAGONG object (hindi minu-mutate ang cart).
//
// `onFileUploaded` (optional) ay tinatawag pagkatapos ma-upload ang bawat File —
// ginagamit para sa "Uploading photos 2 of 4" na progress sa UI.
export async function uploadSlipImages(value, onFileUploaded) {
  if (isBlob(value)) {
    const url = await uploadImageFile(value);
    if (onFileUploaded) onFileUploaded();
    return url;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => uploadSlipImages(v, onFileUploaded)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await uploadSlipImages(v, onFileUploaded)])
    );
    return Object.fromEntries(entries);
  }
  return value;
}

// Ilang File ang natitira sa loob ng order_slip_details (para sa total ng progress).
export function countSlipFiles(value) {
  if (isBlob(value)) return 1;
  if (Array.isArray(value)) return value.reduce((n, v) => n + countSlipFiles(v), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((n, v) => n + countSlipFiles(v), 0);
  return 0;
}

// Ilang reference File ang nasa `inspiration_image` (isa lang, o { [productId]: File } sa bundle).
export function countReferenceFiles(img) {
  if (isBlob(img)) return 1;
  if (img && typeof img === 'object') return Object.values(img).filter(isBlob).length;
  return 0;
}

// Kapalit ng `JSON.stringify(order_slip_details)` sa cart-merge check —
// ang File ay nagiging `{}` kapag na-stringify, kaya magmumukhang pareho ang
// dalawang item na magkaiba ang larawan. Dito, pangalan+laki+lastModified ang
// ginagamit bilang pagkakakilanlan ng File.
export function slipSignature(value) {
  return JSON.stringify(value, (_key, v) => {
    if (isBlob(v)) return `file:${v.name || ''}:${v.size}:${v.lastModified || 0}`;
    return v;
  });
}

// Tinatanggal ang mga field na walang laman (hal. optional na Multi-image na
// walang piniling larawan) para hindi mag-iwan ng `[]` sa order slip.
// Recursive para sakop din ang bundle/package: { [productId]: { label: [] } }.
export function pruneEmptySlipAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || isBlob(answers)) return answers;
  const out = {};
  for (const [k, v] of Object.entries(answers)) {
    if (Array.isArray(v) && v.length === 0) continue;
    const pruned = pruneEmptySlipAnswers(v);
    if (pruned && typeof pruned === 'object' && !Array.isArray(pruned) && !isBlob(pruned) && Object.keys(pruned).length === 0 && v && typeof v === 'object' && Object.keys(v).length > 0) continue;
    out[k] = pruned;
  }
  return out;
}

// True kung walang laman ang sagot ng isang order slip field. Sinusuportahan
// ang Multi-image (array ng File/URL) at ang mga text-type na sagot.
export function isSlipAnswerEmpty(field, answer) {
  if (field?.type === 'Multi-image') return !Array.isArray(answer) || answer.length === 0;
  if (Array.isArray(answer)) return answer.length === 0;
  return !answer || String(answer).trim() === '';
}

const isOptionalField = (f) => f?.optional === true || f?.isOptional === true || f?.required === false;

// Lahat ng Multi-image fields ng isang cart item, kasama ang path kung nasaan
// ang sagot sa `order_slip_details`:
//   regular product : path = [label]
//   bundle/package  : path = [productId, label]  (galing sa item.products / item.package_components)
export function getMultiImageFields(item) {
  const out = [];
  const isMulti = item?.type === 'bundle' || item?.type === 'package';
  if (isMulti) {
    const comps = item.products || item.package_components || [];
    comps.forEach((comp) => {
      (comp.order_slip_fields || []).forEach((f) => {
        if (f.type === 'Multi-image') {
          out.push({ path: [String(comp.id), f.label], label: f.label, group: comp.name, max: f.maxImages, optional: isOptionalField(f) });
        }
      });
    });
  } else {
    (item?.order_slip_fields || []).forEach((f) => {
      if (f.type === 'Multi-image') {
        out.push({ path: [f.label], label: f.label, group: null, max: f.maxImages, optional: isOptionalField(f) });
      }
    });
  }
  return out;
}

export const getSlipValue = (slip, path) =>
  path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), slip);

// Immutable set — ibinabalik ang bagong order_slip_details.
export function setSlipValue(slip, path, value) {
  const base = slip && typeof slip === 'object' ? slip : {};
  const [head, ...rest] = path;
  return { ...base, [head]: rest.length ? setSlipValue(base[head], rest, value) : value };
}

// Mga label ng required na Multi-image field na walang larawan sa cart item
// (hal. binura lahat ng customer sa cart). Ginagamit bago mag-place ng order.
export function findMissingRequiredSlipImages(item) {
  return getMultiImageFields(item)
    .filter((f) => {
      if (f.optional) return false;
      const v = getSlipValue(item.order_slip_details, f.path);
      return !Array.isArray(v) || v.length === 0;
    })
    .map((f) => f.label);
}

// Text na ipinapakita sa cart / order summary para sa isang sagot sa order slip.
// Ang array ng File/URL (Multi-image) ay nagiging "3 photos attached" sa halip
// na subukang i-render ang File object (na magka-crash sa React).
export function formatSlipValueForCart(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v) => isBlob(v) || isImageUrl(v))) {
      return `${value.length} photo${value.length > 1 ? 's' : ''} attached`;
    }
    return value.join(', ');
  }
  if (typeof value === 'object') return isBlob(value) ? '1 photo attached' : JSON.stringify(value);
  return String(value);
}