// backend/src/services/onlineOrdering.services.js
import { randomUUID } from 'crypto';
import { supabase } from '../config/supabase.js'; 
import { toWebP } from '../utils/imageToWebP.js';
import { createOrderError } from '../utils/orderError.js';
import { ProductModel } from '../model/product.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { OrdersModel } from '../model/orders.model.js';
import { CustomersModel } from '../model/customers.model.js';
import { PreOrderCapacityModel } from '../model/preorderCapacity.model.js';
import { MaterialModel } from '../model/material.model.js';
import { RecipeModel } from '../model/recipe.model.js';
import { notifyNewOrder } from './notification.service.js';
import { getBundleById } from './productAndEvent.service.js';

// --- STOCK / DAILY LIMIT BASIS ---
//
// Ang isang product ay maaaring i-track base sa `daily_limit` (para sa
// Pre-order — ilang units ang pwedeng i-order per pickup date) o base sa
// `stock_quantity` (para sa Pick-up Today — kung ilan talaga ang
// naka-ready/produced na stock). Rule (parehong ginagamit sa availability
// computation at sa pag-deduct pagka-Completed na ang order):
//   - Kung may laman (di null at > 0) ang `daily_limit`, ITO ang capacity
//     para sa bawat pickup date,
//     kahit may laman din ang `stock_quantity` (daily_limit wins kapag
//     pareho silang may laman).
//   - Kung wala/0 ang `daily_limit`, babalik sa `stock_quantity`.
// Ginagamit ito kapwa ng Pre-order, Pick-up Today, at "Both" na products —
// hindi lang basta yung may `stock_quantity`.
export const getStockLimitField = (product) => {
  const hasDailyLimit = product?.daily_limit !== null
    && product?.daily_limit !== undefined
    && Number(product.daily_limit) > 0;
  return hasDailyLimit ? 'daily_limit' : 'stock_quantity';
};

export const fetchMenuProducts = async (filters = {}) => {
  let products = []; 
  
  try {
    const result = await ProductModel.findAll(filters);
    
    if (result && Array.isArray(result.data)) {
      products = result.data;
    } else if (Array.isArray(result)) {
      products = result;
    } else {
      products = []; 
    }
  } catch (productError) {
    throw new Error(`Fetch Products Error: ${productError?.message || productError}`);
  }

  let pendingItems = [];
  try {
    const itemsResult = await OrderItemsModel.getPendingItems();
    
    if (itemsResult && Array.isArray(itemsResult.data)) {
      pendingItems = itemsResult.data;
    } else if (Array.isArray(itemsResult)) {
      pendingItems = itemsResult;
    }
  } catch (itemsError) {
    throw new Error(`Fetch Reservations Error: ${itemsError?.message || itemsError}`);
  }

  const materialsResult = await MaterialModel.findAll();
  if (materialsResult.error) throw materialsResult.error;
  const materialByProductId = new Map(
    (materialsResult.data || [])
      .filter(material => material.product_id)
      .map(material => [material.product_id, material])
  );
  const formulaByProductId = await RecipeModel.findFormulaStatusByProductIds(
    products.map(product => product.id)
  );
  products = products.filter(product =>
    product.category === 'Celebration Material'
      || formulaByProductId.get(product.id)?.has_production_formula === true
  );
  
  const reservedBuyNowMap = {};
  
  // 1. I-reserve sa physical stock ang Buy Now rows lang. Ang Pre-Order
  //    reservations ay binibilang nang hiwalay kada pickup date sa checkout.
  pendingItems.forEach(item => {
    if (item.orders?.order_type === 'Pre-Order') return;
    reservedBuyNowMap[item.product_id] = (reservedBuyNowMap[item.product_id] || 0) + item.quantity;
  });

  const productsWithStock = products.map(p => {
    const celebrationMaterial = materialByProductId.get(p.id);
    const limitField = getStockLimitField(p);
    const physicalStock = celebrationMaterial
      ? Number(celebrationMaterial.stock_quantity) || 0
      : Number(p.stock_quantity) || 0;
    const baseStock = limitField === 'daily_limit'
      ? Number(p.daily_limit) || 0
      : physicalStock;
    const reserved = reservedBuyNowMap[p.id] || 0;
    const available = Math.max(0, baseStock - reserved);

    // PRE-ORDER RULE: ang Pre-Order ay GALING LANG sa per-pickup-date capacity (daily_limit),
    // hindi sa stock_quantity. Kapag walang pre-order limit (null / blangko / 0),
    // SARADO ang Pre-Order — kahit may stock_quantity. Pick-up Today na lang
    // ang available (kung may stock).
    const hasPreOrderLimit = limitField === 'daily_limit';

    return {
      ...p,
      stock: baseStock,
      stock_quantity: baseStock,
      is_celebration_material: Boolean(celebrationMaterial),
      celebration_material_id: celebrationMaterial?.id || null,
      stock_basis_field: limitField, // 'daily_limit' o 'stock_quantity' — para malaman ng frontend/consumer kung saan galing ang bilang
      available_stock: available,
      buy_now_available_stock: Math.max(0, physicalStock - reserved),
      // Walang pickup date ang menu request. Ibalik ang configured daily
      // capacity rito; pickup-date reservations are checked at checkout.
      pre_order_available_stock: hasPreOrderLimit && Number(p.daily_limit) > 0 ? Number(p.daily_limit) : 0,
      pre_order_unlimited: !hasPreOrderLimit || Number(p.daily_limit) <= 0,
    };
  });

  return productsWithStock;
};

export const validateProductionFormulaAvailability = async (items = []) => {
  const productIds = [...new Set(items.map(item => item.product_id).filter(Boolean))];
  if (productIds.length === 0) return;

  const products = await ProductModel.findByIds(productIds);
  const productsById = new Map(products.map(product => [product.id, product]));
  const formulaByProductId = await RecipeModel.findFormulaStatusByProductIds(productIds);

  for (const productId of productIds) {
    const product = productsById.get(productId);
    if (!product || product.category === 'Celebration Material') continue;

    if (formulaByProductId.get(productId)?.has_production_formula !== true) {
      throw new Error(`"${product.name || 'Product'}" cannot be ordered because it has no production formula yet.`);
    }
  }
};

export const getStorageBaseUrl = (bucketName) => {
  const { data } = supabase.storage.from(bucketName).getPublicUrl('');
  return data.publicUrl.replace(/\/$/, '');
};

// Mga error na dahil sa network/koneksyon papuntang Supabase (hindi sa policy o
// sa file mismo) — ito lang ang nire-retry. Ang "fetch failed" ay generic na
// mensahe ng Node; ang totoong dahilan ay nasa `cause` (hal. ETIMEDOUT,
// ENOTFOUND, UND_ERR_CONNECT_TIMEOUT), kaya ni-la-log natin ito sa ibaba.
const TRANSIENT_NETWORK_CODES = [
  'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
];

const getErrorCause = (error) =>
  error?.originalError?.cause || error?.cause || error?.originalError || null;

const isTransientStorageError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = getErrorCause(error)?.code || '';
  return message.includes('fetch failed') || TRANSIENT_NETWORK_CODES.includes(code);
};

const UPLOAD_MAX_ATTEMPTS = 3;

export const uploadImageToBucket = async (file, bucketName = 'inspiration-images', folder = '') => {
  const converted = await toWebP(file.buffer, bucketName === 'payment-assets'
    ? { maxSize: 1600, quality: 85 }
    : { maxSize: 1600, quality: 80 });
  let lastError = null;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    // Bagong filename sa bawat subok — kung natuloy pala ang naunang upload
    // kahit pumalya ang response, hindi ito babangga ("already exists").
    const objectName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
    const fileName = folder ? `${folder.replace(/\/+$/, '')}/${objectName}` : objectName;

    try {
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, converted.buffer, {
          contentType: 'image/webp',
          upsert: false
        });

      if (!error) {
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
        return urlData.publicUrl;
      }
      lastError = error;
    } catch (thrown) {
      lastError = thrown;
    }

    const cause = getErrorCause(lastError);
    console.error(
      `[UPLOAD] Attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} failed for "${file.originalname}" (${file.size} bytes):`,
      lastError?.message,
      cause ? `| cause: ${cause.code || ''} ${cause.message || cause}` : ''
    );

    if (!isTransientStorageError(lastError) || attempt === UPLOAD_MAX_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }

  throw new Error(`Supabase Storage Error: ${lastError?.message || 'Upload failed'}`);
};

// --- ACTUAL ORDER CREATION LOGIC ---

const allocateBundlePrice = (products, discountedTotal) => {
  // PROPORTIONAL SPLIT — hinahati ang discounted bundle price base sa
  // RELATIVE na orihinal na presyo (`price`) ng bawat product ("relative
  // standalone selling price" method), hindi pantay-pantay. Kaya kung mas
  // mahal ang isang product bago ma-discount, mas malaki rin ang share
  // niya sa discounted total — parehong % discount ang naa-apply sa bawat
  // item, tama ang per-product revenue/reporting, at fair kung sakaling
  // kailanganing i-refund/i-cancel ang isa lang sa mga item.
  //
  // Ang huling product sa listahan ang kumukuha ng "remainder" sa halip
  // na sarili niyang computed share, para eksaktong tumugma ang kabuuang
  // sum sa totoong binayaran ng customer — walang centavo na "nawawala"
  // o "sumosobra" dahil sa rounding.
  const originalTotal = products.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

  // Fallback kung 0/wala ang lahat ng original prices (hindi dapat
  // mangyari sa totoong data, pero iwasan ang divide-by-zero) — balik sa
  // dating equal split.
  if (originalTotal <= 0) {
    const equalShare = Math.round((discountedTotal / products.length) * 100) / 100;
    let runningTotal = 0;
    return products.map((p, idx) => {
      if (idx === products.length - 1) {
        const remainder = Math.round((discountedTotal - runningTotal) * 100) / 100;
        return { ...p, allocated_price: remainder };
      }
      runningTotal += equalShare;
      return { ...p, allocated_price: equalShare };
    });
  }

  let runningTotal = 0;
  return products.map((p, idx) => {
    if (idx === products.length - 1) {
      const remainder = Math.round((discountedTotal - runningTotal) * 100) / 100;
      return { ...p, allocated_price: remainder };
    }
    const weight = (Number(p.price) || 0) / originalTotal;
    const share = Math.round(discountedTotal * weight * 100) / 100;
    runningTotal += share;
    return { ...p, allocated_price: share };
  });
};

// Kinukuha ang bundle mismo mula sa DB (hindi umaasa sa presyo na ipinasa ng
// client) para hindi ma-manipulate ng customer ang presyo sa pamamagitan lang
// ng pag-edit ng request payload. Hina-validate din dito kung available pa
// ba talaga ang bundle (active at nasa loob ng date range nito) bago tanggapin
// ang order — laban sa "stale cart" na may nag-expire nang promo.
const resolveBundleLineItem = async (item) => {
  const bundle = await getBundleById(item.bundleId);

  if (!bundle) {
    throw new Error(`Bundle not found: ${item.bundleId}`);
  }
  if (bundle.is_active === false) {
    throw new Error(`"${bundle.bundle_name}" is no longer available.`);
  }
  if (bundle.is_within_date_range === false) {
    throw new Error(`"${bundle.bundle_name}" is not available right now (outside its promo date range).`);
  }
  if (!Array.isArray(bundle.products) || bundle.products.length < 2) {
    throw new Error(`"${bundle.bundle_name}" no longer has enough valid products.`);
  }

  const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const allocatedProducts = allocateBundlePrice(bundle.products, Number(bundle.bundle_price || 0));

  // Isang `bundle_group_id` bawat "unit" ng bundle sa cart, para malaman ng
  // frontend/receipt kung aling mga component rows ang dapat i-grupo nang
  // magkasama sa display — kahit hiwalay silang totoong rows sa DB.
  const bundleGroupId = randomUUID();

  return allocatedProducts.map(p => ({
    product_id: p.id,
    product_name: p.name,
    quantity,
    unit_price: p.allocated_price,
    total_price: Math.round(p.allocated_price * quantity * 100) / 100,
    order_slip_details: item.orderSlip || {},
    selected_price_options: null,
    // FIX: dating hardcoded na `null` ito palagi — kahit may na-upload nang
    // larawan ang customer per-component sa BundleModal (`bundleImages`,
    // shape na `{ [productId]: File }`), hindi ito nababasa dito kaya laging
    // walang laman ang customer_reference_url ng bundle rows. Ngayon,
    // binabasa na ang `item.inspirationUrls` (object map na `{ [productId]: url }`,
    // ibinubuo ng frontend pagkatapos i-upload ang bawat File sa bucket bago
    // pa man ito ipasa dito) at ang tamang URL para sa product `p.id` ang
    // ilalagay sa exploded row na iyon.
    customer_reference_url: item.inspirationUrls?.[p.id] || null,
    bundle_id: bundle.id,
    bundle_group_id: bundleGroupId,
    bundle_name: bundle.bundle_name,
    original_unit_price: Number(p.price || 0),
    special_instructions: item.specialInstructions || '',
  }));
};

// "Package" products (Product Management > category "Package") explode into
// order_items the same way a Promo Bundle does — hiniram dito ang parehong
// `bundle_id`/`bundle_group_id`/`bundle_name` na mga column sa order_items
// (walang bagong column na kailangan) — para bawat COMPONENT ng package ay
// maging SARILI nitong order_item row, may sariling order_slip_details
// (kinukuha mula sa `item.orderSlip[componentProductId]`, kagaya ng bundle),
// at sa gayo'y nade-deduct din nang tama ang stock ng bawat isa (parehong
// lohika sa Buy Now/POS at sa online pickup completion, walang extra code na
// kailangan doon).
//
// FIX: hindi na dumadaan sa `allocateBundlePrice` dito (iba ito sa Bundle sa
// itaas) — walang "discount" na kailangang i-divide sa Package dahil FIXED
// na ang presyo ng bawat component mismo sa Product record nito. Ang
// `pkg.price` (ang binayaran ng customer para sa buong package) ay
// nananatiling nakatago lang sa `orders.grand_total`, hindi na kailangang
// i-allocate/i-scale papunta sa mga component rows.
// Ang Package sa cart ng frontend ay may id na `package-<uuid>` (para hindi
// mabangga sa product id sa cart), pero uuid lang ang tinatanggap ng database.
// Kapag may prefix pa ang dumating (hal. `packageId` na naka-fallback sa
// `item.id`), tanggalin muna ito bago maghanap — kung hindi, "invalid input
// syntax for type uuid" ang error at hindi nagagawa ang order pagkatapos ng bayad.
const stripPackagePrefix = (id) => (typeof id === 'string' ? id.replace(/^package-/, '') : id);

// Hinahanap ang Package. Sa kasalukuyang disenyo, ang Package ay isang row sa
// `promo_bundles` (category 'Package') — hindi na sa `products` table — kaya
// `getBundleById` ang unang tinitignan. Kapag wala doon, babalik sa dating
// disenyo (Package bilang product record) para hindi masira ang mga lumang
// package. Ibinabalik ang { name, is_active, package_items, componentProducts }
// o null kung walang makita.
const loadPackageDefinition = async (rawId) => {
  const id = stripPackagePrefix(rawId);
  if (!id) return null;

  try {
    const bundle = await getBundleById(id);
    if (bundle && bundle.category === 'Package') {
      const items = Array.isArray(bundle.package_items) ? bundle.package_items : [];
      return {
        name: bundle.bundle_name || bundle.name,
        is_active: bundle.is_active,
        package_items: items,
        // `enrichPackageBundle` ay naglalagay na ng `product` sa bawat package item.
        componentProducts: items.map(pi => pi.product).filter(Boolean),
      };
    }
  } catch (err) {
    console.warn(`[PACKAGE] promo_bundles lookup failed for ${id}:`, err.message);
  }

  try {
    const legacy = await ProductModel.findById(id);
    if (legacy && legacy.category === 'Package') {
      const items = Array.isArray(legacy.package_items) ? legacy.package_items : [];
      const componentProducts = await ProductModel.findByIds(items.map(c => c.product_id).filter(Boolean));
      return { name: legacy.name, is_active: legacy.is_active, package_items: items, componentProducts };
    }
  } catch {
    // walang ganoong product — ituloy sa "not found"
  }

  return null;
};

const resolvePackageLineItem = async (item) => {
  const packageLookupId = stripPackagePrefix(item.packageId || item.productId);
  const pkg = await loadPackageDefinition(packageLookupId);

  if (!pkg) {
    throw new Error(`Package not found: ${packageLookupId}`);
  }
  if (pkg.is_active === false) {
    throw new Error(`"${pkg.name}" is no longer available.`);
  }
  if (pkg.package_items.length === 0) {
    throw new Error(`"${pkg.name}" has no products configured yet.`);
  }

  const componentById = new Map(pkg.componentProducts.map(p => [String(p.id), p]));

  const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const packageGroupId = randomUUID();

  // FIX: hindi na dumadaan sa `allocateBundlePrice` ang Package — ang
  // function na iyon ay para sa Bundle (promo_bundles), kung saan may
  // DISCOUNT na kailangang i-divide/i-proportion sa mga component dahil
  // mas mababa ang bundle_price kumpara sa sum ng regular presyo ng mga
  // kasamang produkto. Ang isang PACKAGE ay walang ganoong "discount to
  // divide" — bawat component ay may sarili nang FIXED na presyo mula sa
  // Product record nito, kaya iyon mismo ang ilalagay bilang unit_price/
  // total_price ng bawat exploded row (hindi na artificially na-scale
  // papunta sa `pkg.price`). Tama rin ang per-product revenue nito kapag
  // kailangang i-refund/i-report ang isa lang sa mga component, dahil
  // ang totoong presyo mismo ng produkto ang nakalagay, hindi isang
  // hinati-hating bahagi ng package price.
  //
  // Tandaan: dahil dito, hindi na kinakailangang tumugma ang SUM ng mga
  // total_price ng exploded rows sa `orders.grand_total` (na siyang
  // aktwal na binayaran ng customer para sa buong package) — sadyang
  // magkaiba ang dalawa, dahil ang layunin ng order_items dito ay
  // i-record kung ANO at ILAN ang mga aktwal na produktong kasama (para
  // sa stock deduction at per-product reporting), hindi para hatiin ang
  // package price. Ang `orders.grand_total` pa rin (hindi ang sum ng
  // order_items) ang single source of truth para sa aktwal na binayaran.
  const rows = [];
  for (const component of pkg.package_items) {
    if (!component.product_id) continue;
    const componentQty = Number(component.quantity || 0) * quantity;
    if (componentQty <= 0) continue;

    const componentProduct = componentById.get(String(component.product_id));
    const ownUnitPrice = Number(componentProduct?.price) || 0;

    rows.push({
      product_id: component.product_id,
      product_name: componentProduct?.name || component.name,
      quantity: componentQty,
      unit_price: ownUnitPrice,
      total_price: Math.round(ownUnitPrice * componentQty * 100) / 100,

      // FIX: Parehong format na ngayon sa resolveBundleLineItem para walang details na nawawala
      // kung hindi man perpekto ang string/integer matching. Ang buong nested slip ay isasave.
      order_slip_details: item.orderSlip || {},

      selected_price_options: null,
      customer_reference_url: item.inspirationUrls?.[component.product_id] || null,

      // FIX: Gawing null ito para hindi mag-error ang Foreign Key na nakatali sa promo_bundles
      bundle_id: null,

      // BAGO: tahasang ID ng package (promo_bundles.id) sa bawat component row —
      // hindi na kailangang hanapin via bundle_name. Walang FK sa DB (para
      // gumana rin sa lumang package na product record).
      package_id: packageLookupId,

      bundle_group_id: packageGroupId,
      bundle_name: pkg.name,
      original_unit_price: ownUnitPrice,
      special_instructions: item.specialInstructions || '',
    });
  }

  if (rows.length === 0) {
    throw new Error(`"${pkg.name}" has no valid products configured.`);
  }

  return rows;
};

// Regular na (non-bundle) na item — parehong lohika gaya ng dati, walang
// binago sa presyo (galing pa rin ito sa client payload).
const resolveProductLineItem = (item) => ({
  product_id: item.productId,
  product_name: item.name,
  quantity: item.quantity,
  unit_price: item.unitPrice,
  total_price: item.subtotal,
  order_slip_details: item.orderSlip,
  selected_price_options: item.selectedPriceOptions || null,
  customer_reference_url: item.inspirationUrl || null,
  bundle_id: null,
  bundle_group_id: null,
  bundle_name: null,
  original_unit_price: null,
  special_instructions: item.specialInstructions || '',
});

// Ino-resolve ang LAHAT ng items bago pa man gumawa ng customer/order row sa
// DB — kaya kung may invalid na bundle (na-delete, na-deactivate, o
// nag-expire na ang date range), mahuhuli ito BAGO ma-orphan ang isang
// customer/order record na walang laman.
// Ang BACKEND na mismo ang nagpapasya kung Package ang isang item — hindi na
// lang umaasa sa `type`/`packageId` na ipinadala ng frontend. Dati, kapag
// nawala o hindi naipasa ang `type: 'package'` sa payload, nahuhulog ang
// Package sa `resolveProductLineItem` at nagiging ISANG row lang sa
// order_items ("Package A x1") sa halip na sumabog per component. Kabaligtaran
// naman, ang `packageId` na naka-fallback sa `item.id` (para sa lahat ng
// item) ay nagpapadala sa REGULAR na produkto sa package resolver at
// nagre-error na "is not a Package product". Kaya ngayon: kung tahasang
// `type: 'package'`, package; kung bundle, hindi; kung hindi tiyak, tinitignan
// ang category ng product sa DB.
const isPackageItem = async (item) => {
  if (item.type === 'package') return true;
  if (item.type === 'bundle' || item.bundleId) return false;

  const candidateId = stripPackagePrefix(item.packageId || item.productId);
  if (!candidateId) return false;

  const pkg = await loadPackageDefinition(candidateId);
  return Boolean(pkg);
};

export const resolveOrderItems = async (items = []) => {
  const resolved = [];
  for (const item of items) {
    if (item.type === 'bundle' || item.bundleId) {
      const bundleRows = await resolveBundleLineItem(item);
      resolved.push(...bundleRows);
    } else if (await isPackageItem(item)) {
      const packageRows = await resolvePackageLineItem(item);
      resolved.push(...packageRows);
    } else {
      resolved.push(resolveProductLineItem(item));
    }
  }
  return resolved;
};

const addQuantitiesByProduct = (target, items = [], date = '') => {
  if (!target[date]) target[date] = {};
  for (const item of items) {
    if (!item.product_id) continue;
    target[date][item.product_id] = (target[date][item.product_id] || 0) + Number(item.quantity || 0);
  }
};

const getPreOrderAvailabilityForResolvedItems = async (
  resolvedItems,
  startDate,
  endDate
) => {
  const requestedByProduct = {};
  for (const item of resolvedItems) {
    if (!item.product_id) continue;
    requestedByProduct[item.product_id] = (requestedByProduct[item.product_id] || 0) + Number(item.quantity || 0);
  }
  const productIds = Object.keys(requestedByProduct);
  if (productIds.length === 0) return { unavailableDates: [] };

  const products = await Promise.all(productIds.map(id => ProductModel.findById(id)));
  const productById = new Map(products.filter(Boolean).map(product => [String(product.id), product]));
  const reservedByDate = {};

  const existingItems = await OrderItemsModel.getPreOrdersByPickupDateRange(startDate, endDate);
  existingItems.forEach(item => {
    const date = item.orders?.pickup_date;
    if (!date) return;
    addQuantitiesByProduct(reservedByDate, [item], date);
  });

  const unavailableDates = [];
  const from = new Date(`${startDate}T00:00:00Z`);
  const through = new Date(`${endDate}T00:00:00Z`);
  for (const day = new Date(from); day <= through; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const blockedItems = [];
    for (const [productId, requestedQty] of Object.entries(requestedByProduct)) {
      const product = productById.get(String(productId));
      const limit = Number(product?.daily_limit) || 0;
      if (limit <= 0) continue; // zero means unlimited pre-orders
      const reserved = Number(reservedByDate[date]?.[productId] || 0);
      if (reserved + requestedQty > limit) {
        blockedItems.push({
          productId,
          productName: product?.name || 'Product',
          reason: 'limit_reached',
        });
      }
    }
    if (blockedItems.length) unavailableDates.push({ date, blockedItems });
  }

  return { unavailableDates };
};

export const getPreOrderDateAvailability = async ({ items = [], startDate, endDate }) => {
  const resolvedItems = await resolveOrderItems(items);
  return getPreOrderAvailabilityForResolvedItems(resolvedItems, startDate, endDate);
};

export const validatePreOrderPickupDate = async (resolvedItems, pickupDate) => {
  const { unavailableDates } = await getPreOrderAvailabilityForResolvedItems(
    resolvedItems,
    pickupDate,
    pickupDate
  );
  if (unavailableDates.length) {
    const blockedItems = unavailableDates[0].blockedItems.map(item =>
      `${item.productName} (daily limit reached)`
    );
    const error = new Error(`Pre-order is unavailable for ${pickupDate}: ${blockedItems.join(', ')}. Please choose another pickup date.`);
    error.code = 'PREORDER_CAPACITY';
    throw error;
  }
};

// BAGO: kung "Package" ang isang order item (may naka-link na component
// products, hal. cake + cupcake + tarp), ang dating validation ay tumitingin
// lang sa product_id ng PACKAGE mismo — kaya kung may celebration material
// sa LOOB ng package, hindi ito nasusuri kung sapat pa ba ang stock nito
// bago tanggapin ang order. Ino-expand muna nito ang isang item papunta sa
// { product_id, quantity } ng bawat aktwal na component (recursive, kung
// sakaling may package sa loob package) bago ito iche-check sa ibaba.
const expandToComponentQuantities = async (item) => {
  const product = await ProductModel.findById(item.product_id);
  if (product?.category === 'Package' && Array.isArray(product.package_items) && product.package_items.length > 0) {
    const expanded = [];
    for (const component of product.package_items) {
      const qty = Number(component.quantity || 0) * Number(item.quantity || 0);
      if (!component.product_id || qty <= 0) continue;
      const nested = await expandToComponentQuantities({ product_id: component.product_id, quantity: qty });
      expanded.push(...nested);
    }
    return expanded;
  }
  return [{ product_id: item.product_id, quantity: Number(item.quantity || 0) }];
};

export const validateCelebrationMaterialAvailability = async (items = [], orderType) => {
  if (orderType !== 'Buy Now') return;

  const requestedByMaterial = new Map();
  for (const item of items) {
    const expandedItems = await expandToComponentQuantities(item);
    for (const expandedItem of expandedItems) {
      const materialResult = await MaterialModel.findByProductId(expandedItem.product_id);
      if (materialResult.error) throw materialResult.error;
      const material = materialResult.data;
      if (!material) continue;

      requestedByMaterial.set(
        material.id,
        (requestedByMaterial.get(material.id) || 0) + expandedItem.quantity
      );
    }
  }

  for (const [materialId, requested] of requestedByMaterial) {
    const materialResult = await MaterialModel.findById(materialId);
    if (materialResult.error) throw materialResult.error;
    const material = materialResult.data;
    if (Number(material?.stock_quantity || 0) < requested) {
      throw new Error(`"${material?.name || 'Celebration material'}" is Unavailable or Out of Stock.`);
    }
  }
};

// --- INITIAL STATUS NG ONLINE ORDER PARA SA "BOTH" NA PRODUCTS ---
//
// Ang "Both" na product ay pwedeng i-order bilang Pick-up Today (Buy Now)
// O Pre-Order. Rule sa initial status ng online order:
//   - Buy Now / Pick-up Today  -> 'Ready'. Naka-depende ito sa AVAILABLE
//     stock_quantity ng product (produced na), kaya hindi na kailangang
//     hintayin ang production.
//   - Pre-Order                -> 'Confirmed'. Hindi pa napo-produce ang
//     order kahit may stock ang product sa kasalukuyan.
// 'Ready' lang kapag LAHAT ng product sa order ay "Both"; kung may kahalong
// product na hindi "Both", 'Confirmed' pa rin (dating behavior).
//
// NOTE: i-adjust ang BOTH_ORDER_TYPE_FIELDS kung iba ang pangalan ng column
// sa products table kung saan naka-save ang order type ng product.
const BOTH_ORDER_TYPE_FIELDS = [
  'order_type',
  'order_types',
  'availability',
  'availability_type',
  'available_order_types',
];

const normalizeOrderTypeToken = (value) =>
  String(value || '').toLowerCase().replace(/[^a-z]/g, '');

const isPickupToken = (token) => token.includes('buynow') || token.includes('pickup');
const isPreOrderToken = (token) => token.includes('preorder');

export const isBothOrderTypeProduct = (product) => {
  if (!product) return false;

  for (const field of BOTH_ORDER_TYPE_FIELDS) {
    const raw = product[field];
    if (raw === null || raw === undefined) continue;

    if (Array.isArray(raw)) {
      const tokens = raw.map(normalizeOrderTypeToken);
      if (tokens.some(isPickupToken) && tokens.some(isPreOrderToken)) return true;
      if (tokens.includes('both')) return true;
      continue;
    }

    const token = normalizeOrderTypeToken(raw);
    if (token === 'both') return true;
    if (isPickupToken(token) && isPreOrderToken(token)) return true;
  }
  return false;
};

export const resolveInitialOnlineOrderStatus = async (resolvedItems = [], orderType) => {
  // Pre-Order -> laging 'Confirmed' (di pa napo-produce).
  if (orderType !== 'Buy Now') return 'Confirmed';

  const productIds = [...new Set(resolvedItems.map(item => item.product_id).filter(Boolean))];
  if (productIds.length === 0) return 'Confirmed';

  for (const productId of productIds) {
    const product = await ProductModel.findById(productId);
    if (!isBothOrderTypeProduct(product)) return 'Confirmed';
  }
  return 'Ready';
};

export const createDatabaseOrder = async (payload, manualPayment = null) => {
  // 1. I-resolve/i-validate muna ang lahat ng items (kasama ang pag-explode
  //    ng mga bundle) bago gumawa ng kahit anong bagong row sa DB.
  let resolvedItems;
  const reservationId = payload.orderType === 'Pre-Order'
    ? randomUUID()
    : null;
  try {
    resolvedItems = await resolveOrderItems(payload.items);
    await validateProductionFormulaAvailability(resolvedItems);
    if (payload.orderType === 'Pre-Order') {
      if (!payload.pickup?.date) throw new Error('Please select a pickup date.');
      await validatePreOrderPickupDate(resolvedItems, payload.pickup.date);
    }
    console.log(
      `[ORDER] ${payload.items.length} cart item(s) -> ${resolvedItems.length} order_items row(s):`,
      payload.items.map(i => `${i.name || i.packageId || i.bundleId} [type=${i.type || '-'}]`).join(', ')
    );
    await validateCelebrationMaterialAvailability(resolvedItems, payload.orderType);
    if (payload.orderType === 'Pre-Order') {
      await PreOrderCapacityModel.reserve(
        reservationId,
        payload.pickup.date,
        resolvedItems,
        new Date(Date.now() + 30 * 60 * 1000).toISOString()
      );
    }
  } catch (itemsError) {
    throw createOrderError('items', itemsError);
  }

  // Initial status: 'Ready' para sa "Both" na product kapag Pick-up Today,
  // 'Confirmed' para sa Pre-Order (at sa lahat ng iba pa).
  let initialStatus = 'Confirmed';
  try {
    initialStatus = await resolveInitialOnlineOrderStatus(resolvedItems, payload.orderType);
  } catch (statusError) {
    console.error('[ORDER] Failed to resolve initial status, defaulting to Confirmed:', statusError);
  }

  let customerData;
  try {
    customerData = await CustomersModel.create({
      name: payload.customer.name,
      phone: payload.customer.contactNumber,
      alt_phone: payload.customer.alternativeNumber || ''
    });
  } catch (custError) {
    if (reservationId) {
      try { await PreOrderCapacityModel.release(reservationId); } catch (releaseError) {
        console.error('[PRE-ORDER CAPACITY] Failed to release reservation after customer insert failure:', releaseError);
      }
    }
    throw createOrderError('customer', custError);
  }

  const orderToInsert = {
    order_number: payload.orderNumber || `ORD-${Date.now().toString().slice(-4)}`,
    customer_id: customerData.id,
    order_type: payload.orderType,
    source: 'online',
    status: manualPayment ? 'Pending Verification' : 'Confirmed',
    subtotal: payload.payment.grandTotal,
    grand_total: payload.payment.grandTotal,
    payment_type: payload.payment.type,
    amount_paid: payload.payment.amountDueNow,
    balance: payload.payment.balanceAtPickup,
    pickup_date: payload.pickup.date,
    pickup_time: payload.pickup.time,
    pickup_time_end: payload.pickup.timeEnd || null,
    ...(manualPayment ? {
      payment_verification_status: 'Pending',
      proof_of_payment_path: manualPayment.path,
      proof_uploaded_at: new Date().toISOString(),
    } : {}),
  };

  let newOrder;
  try {
    newOrder = await OrdersModel.create([orderToInsert]);
  } catch (orderError) {
    if (reservationId) {
      try { await PreOrderCapacityModel.release(reservationId); } catch (releaseError) {
        console.error('[PRE-ORDER CAPACITY] Failed to release reservation after order insert failure:', releaseError);
      }
    }
    throw createOrderError('order', orderError);
  }

  const itemsToInsert = resolvedItems.map(item => ({
    ...item,
    order_id: newOrder.id,
    // Ang special instructions na tinype ng customer sa Checkout ay napupunta
    // sa `order_items.special_instructions` (parehong text sa bawat row ng order).
    special_instructions: (payload.specialInstructions || '').trim() || item.special_instructions || ''
  }));

  try {
    await OrderItemsModel.createMany(itemsToInsert);
  } catch (itemsError) {
    if (reservationId) {
      try { await PreOrderCapacityModel.release(reservationId); } catch (releaseError) {
        console.error('[PRE-ORDER CAPACITY] Failed to release reservation after item insert failure:', releaseError);
      }
    }
    throw createOrderError('items', itemsError);
  }

  if (reservationId) {
    await PreOrderCapacityModel.linkToOrder(reservationId, newOrder.id);
  }

  notifyNewOrder(newOrder, payload);

  return newOrder;
};

// I-deduct ang stock ng IISANG product/material — hiwalay na function
// (recursive) para magamit din ito paulit-ulit sa bawat COMPONENT ng isang
// "Package" product, hindi lang sa top-level na order item mismo. Kapareho
// ito ng `deductSingleProductStock` sa pos.service.js — dalawang beses itong
// na-duplicate (isa dito, isa doon) dahil hiwalay ang dalawang completion
// flow (online pickup vs. POS walk-in); tingnan ang paliwanag doon.
const deductSingleProductStock = async (productId, quantity, orderType = 'Buy Now') => {
  if (!productId || Number(quantity) <= 0) return;

  const materialResult = await MaterialModel.findByProductId(productId);
  if (materialResult.error) throw materialResult.error;
  if (materialResult.data) {
    await MaterialModel.deductById(materialResult.data.id, quantity);
    console.log(`[SERVICE] Deducted ${quantity} from ${materialResult.data.name}'s celebration material stock.`);
    return;
  }

  const product = await ProductModel.findById(productId);
  if (!product) return;

  if (product.category === 'Package' && Array.isArray(product.package_items) && product.package_items.length > 0) {
    for (const component of product.package_items) {
      const componentQty = Number(component.quantity || 0) * Number(quantity);
      await deductSingleProductStock(component.product_id, componentQty, orderType);
    }
    return;
  }

  // Same stock-basis rule gaya ng availability computation: kung may laman
  // ang daily_limit, iyon ang per-date Pre-Order capacity; kung wala, sa
  // stock_quantity babawas para sa Pick-up Today na produced stock.
  const limitField = getStockLimitField(product);
  // Per-pickup-date Pre-Order capacity stays configured for future dates;
  // completing one order must not reduce the product's daily_limit globally.
  if (orderType === 'Pre-Order' && limitField === 'daily_limit') return;
  const currentValue = Number(product[limitField]) || 0;
  const newValue = Math.max(0, currentValue - Number(quantity));
  await ProductModel.update(productId, { [limitField]: newValue });
};

export const completeOrderAndDeductStock = async (orderId) => {
  console.log(`\n[SERVICE] 1. Starting completeOrderAndDeductStock for Order ID: ${orderId}`);

  // FIX (idempotency guard): kung "Completed" na ang order BAGO pa man ito
  // tawagin (hal. na-double click ang "Mark Completed" button, o parallel
  // na request), hindi na dapat ulitin ang settlement/deduction — hahantong
  // lang ito sa DALAWANG BESES na pagbawas ng stock para sa parehong order.
  // Ito ang parehong idempotency rule na dinagdag din ngayon sa
  // orders.service.js at pos.service.js, para magkatugma ang tatlo sa
  // paggawi tuwing may order na nagiging Completed.
  let existingOrder;
  try {
    existingOrder = await OrdersModel.findById(orderId);
  } catch (findError) {
    console.error('[SERVICE] Error fetching order before completion:', findError);
    throw new Error(`Failed to fetch order: ${findError.message}`);
  }
  if (!existingOrder) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  if (existingOrder.status === 'Completed') {
    console.log('[SERVICE] Order already Completed — skipping duplicate settlement/deduction.');
    return existingOrder;
  }

  let updatedOrder;
  try {
    updatedOrder = await OrdersModel.updateStatus(orderId, 'Completed');
  } catch (updateError) {
    console.error('[SERVICE] Error updating order status:', updateError);
    throw new Error(`Failed to update order: ${updateError.message}`);
  }

  console.log('[SERVICE] 2. Successfully updated order status to:', updatedOrder.status);
  console.log('[SERVICE] 3. Order Type is:', updatedOrder.order_type);

  // NEW: Settle any outstanding balance now that the order is Completed.
  // "Completed" means the customer already picked up the product — for
  // deposit orders (50% paid upfront via manual payment or at the POS), the
  // remaining balance is always collected in person at pickup. Before this
  // fix, `amount_paid` stayed frozen at the original deposit forever, so
  // sales reports kept showing the order as only 50% paid (e.g. 2.5k on a
  // 5k order) even after the customer had actually paid the rest and
  // walked out with the product. Completing the order now also settles the
  // balance to 0 and raises amount_paid to the full grand_total.
  if (Number(updatedOrder.balance) > 0) {
    console.log(`[SERVICE] 3b. Order has an outstanding balance of ${updatedOrder.balance} — settling it now that pickup is complete.`);
    try {
      updatedOrder = await OrdersModel.updatePayment(orderId, {
        amount_paid: updatedOrder.grand_total,
        balance: 0,
        // FIX: dapat din ma-update ang payment_type papuntang 'full' —
        // dati'y amount_paid/balance lang ang na-a-update, kaya
        // nananatiling nagpapakita ng "Deposit: ₱X" sa listahan ng orders
        // kahit fully paid na talaga.
        payment_type: 'full',
      });
      console.log('[SERVICE] 3c. Balance settled. amount_paid is now:', updatedOrder.amount_paid);
    } catch (settleError) {
      // Don't block completion/stock deduction over this — the order is
      // already handed over. Log loudly so it can be fixed manually.
      console.error('[SERVICE] Error settling balance on completion:', settleError);
    }
  }

  console.log('[SERVICE] 4. Fetching order items to deduct stock permanently...');
  
  let items;
  try {
    items = await OrderItemsModel.findByOrderId(orderId);
  } catch (itemsError) {
    console.error('[SERVICE] Error fetching order items:', itemsError);
    throw new Error(`Failed to fetch items: ${itemsError.message}`);
  }

  console.log(`[SERVICE] 5. Found ${items?.length || 0} items to deduct:`, items);

  if (items && items.length > 0) {
    for (const item of items) {
      if (!item.product_id) continue;

      console.log(`[SERVICE] 6. Processing Product ID: ${item.product_id} | Qty to deduct: ${item.quantity}`);

      try {
        await deductSingleProductStock(item.product_id, item.quantity, existingOrder.order_type);
        console.log(`[SERVICE] 9. SUCCESS! Deducted stock for Product ID: ${item.product_id}`);
      } catch (err) {
         console.error(`[SERVICE] 9. Error fetching/updating stock for ${item.product_id}:`, err);
      }
    }
  }

  return updatedOrder;
};

export const createProduct = async (payload) => {
  try {
    return await ProductModel.create(payload);
  } catch (error) {
    throw new Error(`Database insert error: ${error.message}`);
  }
};

export const updateProduct = async (id, payload) => {
  try {
    return await ProductModel.update(id, payload);
  } catch (error) {
    throw new Error(`Database update error: ${error.message}`);
  }
};
