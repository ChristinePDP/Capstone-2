import { supabase } from '../config/supabase.js'; 
import { ProductModel } from '../model/product.model.js';
import { OccasionModel } from '../model/occasions.model.js'; 
import { BundleModel } from '../model/bundle.model.js';
import { RecipeModel } from '../model/recipe.model.js';
import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { AiCacheModel } from '../model/AiCache.model.js'; 

// ============================================================
// STORAGE (BUCKET) HELPERS
// ============================================================
// Ang mga images ay nasa Supabase Storage bucket; ang database ay URL string
// lang ang hawak. Kaya kailangang manual na burahin ang file kapag:
//   - nabura ang product/bundle,
//   - napalitan o naalis ang image sa edit,
//   - na-upload pero hindi na-save (tingnan ang DELETE /upload-image).
//
// IMPORTANT: i-verify na tama ang table/column names sa ibaba. Kapag mali o
// nag-error ang query, ituturing na "may reference pa" ang image at HINDI
// buburahin (safe default) — may lalabas na warning sa console.
const IMAGE_BUCKET = 'product-images';

const PRODUCTS_TABLE = 'products';
const BUNDLES_TABLE = 'promo_bundles';

// Lahat ng lugar sa DB na nagse-save ng URL galing sa bucket na ito.
// Kapag may bagong column/table na gumagamit ng product-images, idagdag dito.
export const IMAGE_REFERENCE_SOURCES = [
  { table: PRODUCTS_TABLE, column: 'image_url' },
  { table: BUNDLES_TABLE, column: 'custom_image_url' }
];

// Kinukuha ang path ng file sa loob ng bucket mula sa public URL.
// Nagre-return ng null kung hindi galing sa bucket natin (hal. external URL),
// para hindi tayo magbura ng hindi atin.
export const extractStoragePath = (url) => {
  if (!url || typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  if (!path || path.includes('..')) return null;
  return path;
};

// May mga bundle/package na ginagamit ang parehong URL ng ibang record, kaya
// huwag burahin ang file hangga't may row pang tumutukoy dito.
const isImageStillReferenced = async (url) => {
  try {
    const results = await Promise.all(
      IMAGE_REFERENCE_SOURCES.map(({ table, column }) =>
        supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, url)
      )
    );
    for (const r of results) {
      if (r.error) {
        console.warn('[image cleanup] Reference check failed, skipping delete:', r.error.message);
        return true; // safe default: huwag burahin
      }
    }
    return results.some((r) => (r.count || 0) > 0);
  } catch (err) {
    console.warn('[image cleanup] Reference check error, skipping delete:', err.message);
    return true;
  }
};

// Best-effort: hindi ito nagta-throw, para hindi mabigo ang main operation
// (delete/update ng product) dahil lang sa cleanup.
// Returns: 'deleted' | 'in_use' | 'invalid' | 'failed'
export const deleteImageFromBucket = async (url) => {
  try {
    const path = extractStoragePath(url);
    if (!path) return 'invalid';
    if (await isImageStillReferenced(url)) return 'in_use';

    const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    if (error) {
      console.error('[image cleanup] Failed to remove from bucket:', error.message);
      return 'failed';
    }
    return 'deleted';
  } catch (err) {
    console.error('[image cleanup] Unexpected error:', err);
    return 'failed';
  }
};

// Hinahanap (at optionally binubura) ang mga file sa bucket na wala nang
// product/bundle na gumagamit — para sa mga orphan na naipon bago ang fix na ito.
//  - dryRun = true (default): nagli-list lang, walang binubura.
//  - Hindi ginagalaw ang mga file na mas bago sa minAgeHours (default 24h),
//    para hindi mabura ang image na kaa-upload pa lang at hindi pa nase-save.
//  - Kapag pumalya ang kahit anong query, mag-the-throw (walang buburahin).
export const cleanOrphanImages = async ({ dryRun = true, minAgeHours = 24 } = {}) => {
  // 1. Lahat ng file sa bucket (flat ang upload natin)
  const files = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .list('', { limit: pageSize, offset, sortBy: { column: 'created_at', order: 'asc' } });
    if (error) throw new Error(`Bucket list failed: ${error.message}`);
    if (!data || data.length === 0) break;
    files.push(...data.filter((f) => f.id)); // folders ay walang id
    if (data.length < pageSize) break;
  }

  // 2. Lahat ng path na may reference pa sa DB
  const referenced = new Set();
  for (const { table, column } of IMAGE_REFERENCE_SOURCES) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .not(column, 'is', null)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Reference query failed (${table}.${column}): ${error.message}`);
      (data || []).forEach((row) => {
        const p = extractStoragePath(row[column]);
        if (p) referenced.add(p);
      });
      if (!data || data.length < pageSize) break;
    }
  }

  // 3. Orphans = nasa bucket pero walang reference, at luma na
  const cutoff = Date.now() - minAgeHours * 60 * 60 * 1000;
  const orphans = files.filter((f) => {
    if (referenced.has(f.name)) return false;
    const created = new Date(f.created_at || f.updated_at || 0).getTime();
    return created < cutoff;
  });

  const sizeOf = (list) => list.reduce((n, f) => n + (f.metadata?.size || 0), 0);
  const toMB = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));

  let removed = 0;
  if (!dryRun) {
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100).map((f) => f.name);
      const { error } = await supabase.storage.from(IMAGE_BUCKET).remove(batch);
      if (error) console.error('[image cleanup] Batch failed:', error.message);
      else removed += batch.length;
    }
  }

  return {
    dryRun,
    minAgeHours,
    totalFiles: files.length,
    totalMB: toMB(sizeOf(files)),
    referencedCount: referenced.size,
    orphanCount: orphans.length,
    orphanMB: toMB(sizeOf(orphans)),
    removed,
    sample: orphans.slice(0, 50).map((f) => f.name)
  };
};

const getCurrentImageUrl = async (table, column, id) => {
  try {
    const { data, error } = await supabase.from(table).select(column).eq('id', id).maybeSingle();
    if (error) return null;
    return data?.[column] || null;
  } catch {
    return null;
  }
};

// ============================================================
// PRODUCT CRUD SERVICES
// ============================================================

export const getAllProducts = async (filters = {}) => {
  try {
    // Product & Event is the admin catalog. A product must remain visible
    // there until it is explicitly deleted; ordering/POS apply their own
    // active/formula rules in their respective services.
    const { data, error } = await ProductModel.findAll({
      ...filters,
      activeOnly: false,
    });
    if (error) throw error;
    const products = data || [];
    const formulaByProductId = await RecipeModel.findFormulaStatusByProductIds(
      products.map(product => product.id)
    );

    return products.map(product => {
      if (product.category === 'Celebration Material') {
        return {
          ...product,
          has_production_formula: true,
          formula_status: 'not_required',
        };
      }

      const formula = formulaByProductId.get(product.id);
      return {
        ...product,
        has_production_formula: formula?.has_production_formula === true,
        formula_status: formula?.has_production_formula === true ? 'ready' : 'missing',
        recipe_id: formula?.recipe_id || null,
        recipe_ingredient_count: formula?.recipe_ingredient_count || 0,
      };
    });
  } catch (error) {
    throw new Error(`Service Error (getAllProducts): ${error.message}`);
  }
};

export const createDatabaseProduct = async (productData) => {
  let validTags = [];
  try {
    const events = await OccasionModel.findAll();
    const dbTags = events.map(o => o.event_tag).filter(Boolean);
    validTags = [...new Set(dbTags)];
  } catch (err) {
    console.error("Error fetching events for validation:", err);
  }

  let initialTags = [];
  if (productData.event_tags && Array.isArray(productData.event_tags) && productData.event_tags.length > 0) {
    initialTags = productData.event_tags.filter(tag => validTags.includes(tag));
  }

  const productToInsert = {
    name: productData.name,
    category: productData.category,
    is_active: productData.is_active ?? true,
    order_type: productData.order_type || 'Both',
    price: productData.price,
    inclusion: productData.inclusion || '',
    image_url: productData.image_url || null,
    daily_limit: productData.daily_limit || 0,
    order_slip_fields: productData.order_slip_fields || [],
    allow_file_upload: productData.allow_file_upload || false,
    pricing_mode: productData.pricing_mode || 'fixed',
    price_groups: productData.price_groups || [],
    price_matrix: productData.price_matrix || [],
    event_tags: initialTags,
    // BAGO: para sa mga "Package" products — listahan ng mga component
    // products (hal. cake, cupcake, tarp) na dapat ma-deduct sa kani-kanilang
    // sariling stock kapag na-order ang package na ito. Tingnan ang
    // pos.service.js / onlineOrdering.service.js para sa deduction logic.
    package_items: Array.isArray(productData.package_items) ? productData.package_items : []
  };

  try {
    const response = await ProductModel.create([productToInsert]);
    if (response.error) throw new Error(response.error.message);
    return Array.isArray(response.data) ? response.data[0] : response.data;
  } catch (productError) {
    throw new Error(`Product Error: ${productError.message}`);
  }
};

export const updateDatabaseProduct = async (id, productData) => {
  let validTags = [];
  try {
    const events = await OccasionModel.findAll();
    const dbTags = events.map(o => o.event_tag).filter(Boolean);
    validTags = [...new Set(dbTags)];
  } catch (err) {
    console.error("Error fetching events for validation:", err);
  }

  const productToUpdate = {
    name: productData.name,
    category: productData.category,
    order_type: productData.order_type,
    price: productData.price,
    inclusion: productData.inclusion,
    image_url: productData.image_url,
    daily_limit: productData.daily_limit,
    order_slip_fields: productData.order_slip_fields,
    allow_file_upload: productData.allow_file_upload,
    pricing_mode: productData.pricing_mode,
    price_groups: productData.price_groups,
    price_matrix: productData.price_matrix,
    event_tags: productData.event_tags ? productData.event_tags.filter(tag => validTags.includes(tag)) : [],
    // BAGO: tingnan ang paliwanag sa createDatabaseProduct sa itaas.
    package_items: productData.package_items
  };

  Object.keys(productToUpdate).forEach((key) => {
    if (productToUpdate[key] === undefined) delete productToUpdate[key];
  });

  try {
    // Kunin ang lumang image BAGO mag-update para malaman kung napalitan/naalis.
    const oldImageUrl = await getCurrentImageUrl(PRODUCTS_TABLE, 'image_url', id);

    const response = await ProductModel.update(id, productToUpdate);
    if (response.error) throw new Error(response.error.message);

    // Burahin ang lumang file kung napalitan o naalis ang image (DB muna bago bucket).
    if ('image_url' in productToUpdate && oldImageUrl && oldImageUrl !== (productToUpdate.image_url || null)) {
      await deleteImageFromBucket(oldImageUrl);
    }

    return response.data;
  } catch (error) {
    throw new Error(`Service Error (updateDatabaseProduct): ${error.message}`);
  }
};

export const deleteDatabaseProduct = async (id) => {
  try {
    const imageUrl = await getCurrentImageUrl(PRODUCTS_TABLE, 'image_url', id);

    const response = await ProductModel.delete(id);
    if (response.error) throw new Error(response.error.message);

    // DB muna bago bucket: kung pumalya ang delete, hindi mawawalan ng image ang buhay na product.
    await deleteImageFromBucket(imageUrl);

    return response.data;
  } catch (error) {
    throw new Error(`Service Error (deleteDatabaseProduct): ${error.message}`);
  }
};

export const uploadImageToProductBucket = async (file) => {
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) throw new Error(`Supabase Storage Error: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
};

// ============================================================
// PROMO BUNDLE SERVICES
// ============================================================

// Shared "is today's month/day inside this month/day range" checker.
// Ginagamit ito ng parehong bundle availability (dito) at event/occasion
// "is live today" checks sa ibaba — iisang lohika lang, para hindi
// mag-drift ang dalawa. Sinusuportahan ang wrap-around range (hal.
// Dec 15 -> Jan 5) sa pamamagitan ng OR check kapag start > end.
const isDateInMonthDayRange = (month, day, startMonth, startDay, endMonth, endDay) => {
  const current = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;

  if (start <= end) {
    return current >= start && current <= end;
  }
  return current >= start || current <= end;
};

// Kinukuha ang lahat ng ACTIVE occasions at inaayos bilang { event_tag: occasion }
// para mabilis itong ma-lookup ng bawat bundle sa halip na mag-query paulit-ulit.
// Kapag na-delete/na-deactivate ang occasion, mawawala rin ito sa map na ito —
// kaya awtomatikong nagiging "not available" ang bundles na naka-tag dito.
const getActiveOccasionsByTag = async () => {
  try {
    const occasions = await OccasionModel.findAll({ activeOnly: true });
    const byTag = {};
    occasions.forEach(o => {
      if (o.event_tag) byTag[o.event_tag] = o;
    });
    return byTag;
  } catch (err) {
    console.error('Error fetching occasions for bundle availability check:', err);
    return {};
  }
};

// FIX: dating tinitingnan lang ng function na ito ang SARILING start/end ng
// bundle — pero kapag "Linked to Event" ang availabilityMode (may event_tag),
// LAGING null ang mga field na iyon (tingnan ang BundleFormModal.handleSubmit
// sa frontend), kaya laging bumabalik itong `true` ("always available") kahit
// malayo pa ang event. Ngayon, kapag may event_tag ang bundle, ang basehan na
// ay ang TALAGANG date range ng kaparehong occasion (event) sa `occasions`
// table — hindi na sariling start/end ng bundle. Kung walang match na active
// occasion sa event_tag (na-delete/na-deactivate/mali ang tag), itinuturing
// itong HINDI available — "wait for it" hanggang aktwal na dumating ang araw.
const isBundleWithinDateRange = (bundle, today, occasionsByTag = {}) => {
  const month = today.getMonth() + 1;
  const day = today.getDate();

  if (bundle.event_tag) {
    const occasion = occasionsByTag[bundle.event_tag];
    if (!occasion) return false;
    return isDateInMonthDayRange(
      month, day,
      occasion.start_month || 1, occasion.start_day || 1,
      occasion.end_month || 12, occasion.end_day || 31
    );
  }

  // Walang event_tag: "Specific Dates" mode (may sariling start/end) o
  // "Always Available" mode (walang laman ang apat na field — laging true).
  if (!bundle.start_month || !bundle.start_day || !bundle.end_month || !bundle.end_day) {
    return true;
  }
  return isDateInMonthDayRange(month, day, bundle.start_month, bundle.start_day, bundle.end_month, bundle.end_day);
};

// Normalizes a value so combo matching isn't broken by type/case/whitespace
// differences between how the option was saved (bundle_options) and how the
// matrix combo was saved (product.price_matrix).
const normalizeOptionValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

// Finds the matrix entry whose combo matches the selected options.
// Tolerant of: string/number mismatches, casing, extra whitespace, and
// combos that have MORE keys defined than the bundle actually stored
// (only compares keys present in the matrix entry's combo).
const findMatrixPrice = (product, options = {}) => {
  if (!Array.isArray(product.price_matrix) || product.price_matrix.length === 0) {
    return null;
  }

  const normalizedOptions = Object.fromEntries(
    Object.entries(options).map(([k, v]) => [k, normalizeOptionValue(v)])
  );

  const match = product.price_matrix.find(entry =>
    entry.combo &&
    Object.entries(entry.combo).every(
      ([k, v]) => normalizedOptions[k] === normalizeOptionValue(v)
    )
  );

  if (match) return Number(match.price);

  // Fallback: nothing matched exactly. Instead of silently defaulting to 0
  // (which erases the discount % and strikethrough price on the frontend),
  // fall back to the lowest price in the matrix and warn so the mismatch
  // can be traced from the logs.
  console.warn(
    `[enrichBundleWithPricing] No price_matrix match for product "${product.name}" (id: ${product.id}). ` +
    `Selected options: ${JSON.stringify(options)}. Available combos: ${JSON.stringify(product.price_matrix.map(e => e.combo))}. ` +
    `Falling back to lowest matrix price.`
  );
  const lowest = product.price_matrix.reduce(
    (min, entry) => Math.min(min, Number(entry.price) || Infinity),
    Infinity
  );
  return Number.isFinite(lowest) ? lowest : null;
};

const enrichBundleWithPricing = async (bundle, occasionsByTag = {}) => {
  // Accept string OR number ids — don't silently drop numeric ids.
  let safeIds = [];
  if (Array.isArray(bundle.product_ids)) {
    safeIds = bundle.product_ids
      .filter(id => id !== null && id !== undefined && id !== '')
      .map(id => String(id));
  }

  const products = await ProductModel.findByIds(safeIds);
  const bundleOptions = bundle.bundle_options || {};

  const originalTotal = products.reduce((sum, p) => {
    // bundle_options keys may have been saved as either the string or
    // number form of the product id — check both.
    const options = bundleOptions[p.id] ?? bundleOptions[String(p.id)] ?? {};

    let price = Number(p.price || 0); // Base/fixed price default

    if (p.pricing_mode === 'variable') {
      const matrixPrice = findMatrixPrice(p, options);
      if (matrixPrice !== null) {
        price = matrixPrice;
      }
    }

    return sum + price;
  }, 0);

  const bundlePrice = Number(bundle.discounted_price || 0);

  // Only show a discount % when the original total is actually higher
  // than the bundle price.
  const discountPercent = originalTotal > bundlePrice
    ? Math.round((1 - bundlePrice / originalTotal) * 100)
    : 0;

  return {
    ...bundle,
    products,
    original_total: originalTotal,
    bundle_price: bundlePrice,
    discount_percent: discountPercent,
    is_within_date_range: isBundleWithinDateRange(bundle, new Date(), occasionsByTag)
  };
};

// BAGO: "Package" (dating hiwalay na product record na may category:
// 'Package') ay nasa promo_bundles table na rin ngayon, kasabay ng
// "Bundle". Magkaiba ang enrichment nila: Bundle ay tungkol sa discount %
// laban sa product_ids/bundle_options, samantalang Package ay tungkol sa
// component products (package_items: [{product_id, name, quantity}]) na
// idededuct sa sarili nilang stock pag na-order — walang discount % o
// event/date availability window.
const enrichPackageBundle = async (bundle) => {
  let safeIds = [];
  if (Array.isArray(bundle.package_items)) {
    safeIds = bundle.package_items
      .map(item => item.product_id)
      .filter(id => id !== null && id !== undefined && id !== '')
      .map(id => String(id));
  }

  const componentProducts = await ProductModel.findByIds(safeIds);
  const productsById = new Map(componentProducts.map(p => [String(p.id), p]));

  const packageItems = (bundle.package_items || []).map(item => {
    const product = productsById.get(String(item.product_id)) || null;
    const unitPrice = Number(product?.price || 0);
    return {
      ...item,
      product,
      unit_price: unitPrice,
      line_total: unitPrice * Number(item.quantity || 0)
    };
  });

  const componentsTotal = packageItems.reduce((sum, item) => sum + item.line_total, 0);
  const packagePrice = Number(bundle.discounted_price || 0);

  return {
    ...bundle,
    category: 'Package',
    package_items: packageItems,
    // Para magamit pa rin ng parehong BundleCard/BundleImageGrid sa
    // frontend (products[].image_url) nang walang extra branching doon.
    products: componentProducts,
    original_total: componentsTotal,
    bundle_price: packagePrice,
    discount_percent: componentsTotal > packagePrice && componentsTotal > 0
      ? Math.round((1 - packagePrice / componentsTotal) * 100)
      : 0,
    // Walang event/date-range na availability ang Package — laging
    // "within range" hangga't active. Ang stock/limit nito ay galing sa mga
    // component products.
    is_within_date_range: true
  };
};

// `filters.visibleOnly === 'true'` (galing sa `?visibleOnly=true` query param)
// ay ginagamit ng PUBLIC-facing na Home.jsx para makuha lang ang mga bundle na
// dapat talagang lumabas ngayon (active AT nasa loob ng availability window,
// event-based man o specific-dates). Ang ADMIN page (PromoBundles.jsx) ay
// hindi nagpapasa ng param na ito kaya nakikita pa rin doon LAHAT — kasama
// ang mga "out of season"/inactive — para maayos itong ma-manage.
export const getAllBundles = async (filters = {}) => {
  try {
    const { data, error } = await BundleModel.findAll(filters);
    if (error) throw error;

    const occasionsByTag = await getActiveOccasionsByTag();

    const bundlesWithPricing = await Promise.all(
      (data || []).map(bundle =>
        bundle.category === 'Package'
          ? enrichPackageBundle(bundle)
          : enrichBundleWithPricing(bundle, occasionsByTag)
      )
    );

    // `?category=Bundle` o `?category=Package` — para hiwalay ang dalawa sa
    // POS/storefront. Walang param = lahat (admin). Lumang rows na walang
    // category ay 'Bundle'.
    const wantedCategory = filters.category;
    const byCategory = (wantedCategory === 'Bundle' || wantedCategory === 'Package')
      ? bundlesWithPricing.filter(b => (b.category || 'Bundle') === wantedCategory)
      : bundlesWithPricing;

    const visibleOnly = filters.visibleOnly === 'true' || filters.visibleOnly === true;
    if (visibleOnly) {
      return byCategory.filter(b => b.is_active && b.is_within_date_range);
    }

    return byCategory;
  } catch (error) {
    throw new Error(`Service Error (getAllBundles): ${error.message}`);
  }
};

export const getBundleById = async (id) => {
  try {
    const bundle = await BundleModel.findById(id);
    if (!bundle) return null;
    if (bundle.category === 'Package') return enrichPackageBundle(bundle);
    const occasionsByTag = await getActiveOccasionsByTag();
    return enrichBundleWithPricing(bundle, occasionsByTag);
  } catch (error) {
    throw new Error(`Service Error (getBundleById): ${error.message}`);
  }
};

// BAGO: "Package" ngayon ay isa na ring row sa promo_bundles (category:
// 'Package') sa halip na product record — kaya dito na rin ito
// isinasave/kinukuha. Iba ang laman ng row kumpara sa isang "Bundle":
// package_items (component products + quantity) at ang presyo mismo
// (hindi discount %), sa halip na product_ids/bundle_options/event/date
// availability na ginagamit lang ng Bundle.
const VALID_ORDER_TYPES = ['Pick-up Today', 'Pre-order', 'Both'];
// Iniiwasan ang check-constraint error: kapag invalid/wala ang order_type, 'Both' ang default.
const normalizeOrderType = (value) => (VALID_ORDER_TYPES.includes(value) ? value : 'Both');

const buildPackageInsertRow = (bundleData) => ({
  category: 'Package',
  bundle_name: bundleData.bundle_name,
  product_ids: [],
  bundle_options: {},
  discounted_price: bundleData.price ?? bundleData.discounted_price ?? 0,
  custom_image_url: bundleData.custom_image_url || null,
  // Ang inclusion ng Package ay nasa promo_bundles row na mismo (hindi na sa Product record).
  inclusion: bundleData.inclusion || '',
  event_tag: null,
  is_active: bundleData.is_active ?? true,
  order_type: normalizeOrderType(bundleData.order_type),
  start_month: null,
  start_day: null,
  end_month: null,
  end_day: null,
  package_items: Array.isArray(bundleData.package_items) ? bundleData.package_items : []
});

const buildBundleInsertRow = (bundleData) => ({
  category: 'Bundle',
  bundle_name: bundleData.bundle_name,
  product_ids: bundleData.product_ids || [],
  bundle_options: bundleData.bundle_options || {},
  discounted_price: bundleData.discounted_price || 0,
  custom_image_url: bundleData.custom_image_url || null,
  event_tag: bundleData.event_tag || null,
  is_active: bundleData.is_active ?? true,
  start_month: bundleData.start_month || null,
  start_day: bundleData.start_day || null,
  end_month: bundleData.end_month || null,
  end_day: bundleData.end_day || null,
  order_type: normalizeOrderType(bundleData.order_type),
  package_items: []
});

export const createBundle = async (bundleData) => {
  const isPackage = bundleData.category === 'Package';
  const bundleToInsert = isPackage ? buildPackageInsertRow(bundleData) : buildBundleInsertRow(bundleData);

  try {
    const response = await BundleModel.create(bundleToInsert);
    if (response.error) throw new Error(response.error.message);

    const savedBundle = Array.isArray(response.data) ? response.data[0] : response.data;

    if (isPackage) return enrichPackageBundle(savedBundle);

    const occasionsByTag = await getActiveOccasionsByTag();
    return enrichBundleWithPricing(savedBundle, occasionsByTag);
  } catch (error) {
    throw new Error(`Service Error (createBundle): ${error.message}`);
  }
};

export const updateBundle = async (id, bundleData) => {
  // Category is locked in the frontend once a row is saved (a Bundle and a
  // Package can't be converted into each other), so we trust whatever
  // category the client sends on update. Default to 'Bundle' only for old
  // payloads that predate the category field.
  const isPackage = bundleData.category === 'Package';

  const bundleToUpdate = isPackage
    ? {
        category: 'Package',
        bundle_name: bundleData.bundle_name,
        discounted_price: bundleData.price ?? bundleData.discounted_price,
        custom_image_url: bundleData.custom_image_url,
        inclusion: bundleData.inclusion,
        is_active: bundleData.is_active,
        package_items: bundleData.package_items,
        order_type: bundleData.order_type !== undefined ? normalizeOrderType(bundleData.order_type) : undefined,
        // Package rows never carry these — explicitly clear them in case an
        // older row is being re-saved.
        product_ids: [],
        bundle_options: {},
        event_tag: null,
        start_month: null,
        start_day: null,
        end_month: null,
        end_day: null
      }
    : {
        category: 'Bundle',
        bundle_name: bundleData.bundle_name,
        product_ids: bundleData.product_ids,
        bundle_options: bundleData.bundle_options,
        discounted_price: bundleData.discounted_price,
        custom_image_url: bundleData.custom_image_url,
        event_tag: bundleData.event_tag,
        is_active: bundleData.is_active,
        start_month: bundleData.start_month,
        start_day: bundleData.start_day,
        end_month: bundleData.end_month,
        end_day: bundleData.end_day,
        order_type: bundleData.order_type !== undefined ? normalizeOrderType(bundleData.order_type) : undefined,
        // Package-only field — nililinis kapag Package → Bundle ang pinalitan.
        package_items: []
      };

  Object.keys(bundleToUpdate).forEach((key) => {
    if (bundleToUpdate[key] === undefined) delete bundleToUpdate[key];
  });

  try {
    const oldImageUrl = await getCurrentImageUrl(BUNDLES_TABLE, 'custom_image_url', id);

    const response = await BundleModel.update(id, bundleToUpdate);
    if (response.error) throw new Error(response.error.message);

    // Walang na-match na row (nadelete na, mali ang id, atbp.) — hindi ito
    // dapat maging generic 500, kundi malinaw na "not found" signal papunta
    // sa controller.
    if (response.notFound) return null;

    // Burahin ang lumang file kung napalitan o naalis ang custom image.
    if ('custom_image_url' in bundleToUpdate && oldImageUrl && oldImageUrl !== (bundleToUpdate.custom_image_url || null)) {
      await deleteImageFromBucket(oldImageUrl);
    }

    if (isPackage) return enrichPackageBundle(response.data);

    const occasionsByTag = await getActiveOccasionsByTag();
    return enrichBundleWithPricing(response.data, occasionsByTag);
  } catch (error) {
    throw new Error(`Service Error (updateBundle): ${error.message}`);
  }
};

export const deleteBundle = async (id) => {
  try {
    const imageUrl = await getCurrentImageUrl(BUNDLES_TABLE, 'custom_image_url', id);

    const response = await BundleModel.delete(id);
    if (response.error) throw new Error(response.error.message);

    // Ganoon din dito: kapag wala nang row na na-delete (idempotent retry,
    // stale UI, atbp.), ibalik na lang ang null imbes na mag-throw.
    if (response.notFound) return null;

    await deleteImageFromBucket(imageUrl);

    return response.data;
  } catch (error) {
    throw new Error(`Service Error (deleteBundle): ${error.message}`);
  }
};

// ============================================================
// EVENTS CRUD SERVICES
// ============================================================

export const getAllEvents = async ({ activeOnly = false } = {}) => {
  try {
    return await OccasionModel.findAll({ activeOnly });
  } catch (error) {
    throw new Error(`Service Error (getAllEvents): ${error.message}`);
  }
};

export const getEventById = async (id) => {
  try {
    return await OccasionModel.findById(id);
  } catch (error) {
    throw new Error(`Service Error (getEventById): ${error.message}`);
  }
};

export const createEvent = async (eventData) => {
  const eventToInsert = {
    event_name: eventData.event_name,
    event_tag: eventData.event_tag,
    start_month: eventData.start_month,
    start_day: eventData.start_day,
    end_month: eventData.end_month,
    end_day: eventData.end_day,
    is_active: eventData.is_active ?? true
  };

  try {
    return await OccasionModel.create(eventToInsert);
  } catch (error) {
    throw new Error(`Service Error (createEvent): ${error.message}`);
  }
};

export const updateEvent = async (id, eventData) => {
  const eventToUpdate = {
    event_name: eventData.event_name,
    event_tag: eventData.event_tag,
    start_month: eventData.start_month,
    start_day: eventData.start_day,
    end_month: eventData.end_month,
    end_day: eventData.end_day,
    is_active: eventData.is_active
  };

  Object.keys(eventToUpdate).forEach((key) => {
    if (eventToUpdate[key] === undefined) delete eventToUpdate[key];
  });

  try {
    return await OccasionModel.update(id, eventToUpdate);
  } catch (error) {
    throw new Error(`Service Error (updateEvent): ${error.message}`);
  }
};

export const deleteEvent = async (id) => {
  try {
    return await OccasionModel.remove(id);
  } catch (error) {
    throw new Error(`Service Error (deleteEvent): ${error.message}`);
  }
};

// ============================================================
// HOMEPAGE AI ADVERTISEMENT GENERATOR
// ============================================================

const BEST_SELLERS_THEME = {
  title: 'Best Selling Treats.',
  subtitle: 'Our most-loved cakes and pastries, picked by our customers.',
  badge: 'Customer Favorites',
  bgGradient: 'bg-[#FCFAF9]',
  textColor: 'text-[#8A7264]',
  badgeBg: 'bg-[#3B1F0A]'
};

export const generateHomepageAds = async () => {
  try {
    const { data: productsData, error: prodError } = await supabase
      .from('products')
      .select(`
        id, 
        name, 
        category, 
        price, 
        image_url,
        pricing_mode,
        price_matrix,
        event_tags,
        order_items ( quantity )
      `)
      .eq('is_active', true);

    if (prodError) throw prodError;

    const productsWithSales = productsData.map(p => {
      const totalSold = p.order_items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const { order_items, ...cleanProduct } = p;
      return { ...cleanProduct, total_sold: totalSold };
    });

    const topProducts = productsWithSales
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 5);

    const homepageAds = {
      theme: BEST_SELLERS_THEME,
      products: topProducts
    };

    const CACHE_KEY = 'homepage_ad_recommendations';
    const TTL_MS = 24 * 60 * 60 * 1000; 

    await AiCacheModel.upsert(CACHE_KEY, homepageAds, TTL_MS);
    console.log(`[SERVICE] Homepage Ads (Best Sellers) successfully generated and cached.`);

    return homepageAds;
  } catch (error) {
    console.error(`[SERVICE] Error generating homepage ads:`, error);
    throw error;
  }
};

// ============================================================
// EVENT ADS MODAL
// ============================================================

const EVENT_ADS_CACHE_KEY = 'event_ads_homepage';
const EVENT_ADS_TTL_MS = 24 * 60 * 60 * 1000;
const EVENT_ADS_INACTIVE_PAYLOAD = { active: false };

const EVENT_ICON_OPTIONS = [
  'heart', 'gift', 'cake', 'sparkle', 'star',
  'snowflake', 'ghost', 'flower', 'party'
];

const isEventLiveToday = (event, today) => {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return isDateInMonthDayRange(
    month, day,
    event.start_month || 1, event.start_day || 1,
    event.end_month || 12, event.end_day || 31
  );
};

export const generateEventAds = async () => {
  try {
    const today = new Date();

    const events = await OccasionModel.findAll({ activeOnly: true });
    const liveEvents = events.filter(e => isEventLiveToday(e, today));

    if (liveEvents.length === 0) {
      await AiCacheModel.upsert(EVENT_ADS_CACHE_KEY, EVENT_ADS_INACTIVE_PAYLOAD, EVENT_ADS_TTL_MS);
      console.log('[SERVICE] Walang live event ngayon. Event Ads cache cleared.');
      return EVENT_ADS_INACTIVE_PAYLOAD;
    }

    const liveTags = liveEvents.map(e => e.event_tag).filter(Boolean);

    const { data: productsData, error: prodError } = await supabase
      .from('products')
      .select('id, name, category, price, image_url, pricing_mode, price_matrix, event_tags')
      .eq('is_active', true);

    if (prodError) throw prodError;

    const formulaByProductId = await RecipeModel.findFormulaStatusByProductIds(
      (productsData || []).map(product => product.id)
    );
    const matchingProducts = (productsData || []).filter(
      p => p.category === 'Celebration Material'
        || formulaByProductId.get(p.id)?.has_production_formula === true
    ).filter(
      p => Array.isArray(p.event_tags) && p.event_tags.some(tag => liveTags.includes(tag))
    );

    if (matchingProducts.length === 0) {
      await AiCacheModel.upsert(EVENT_ADS_CACHE_KEY, EVENT_ADS_INACTIVE_PAYLOAD, EVENT_ADS_TTL_MS);
      console.log('[SERVICE] May live event pero walang naka-tag na products. Event Ads cache cleared.');
      return EVENT_ADS_INACTIVE_PAYLOAD;
    }

    const systemPrompt = `You are the marketing copywriter for Aileen and Niculus Cake Shop, a Filipino bakeshop. There is currently a live event happening. Write short, warm marketing copy for a homepage popup (modal) announcing it, and pick which of the given already-tagged products to feature.

Live Event(s): ${JSON.stringify(liveEvents.map(e => ({ name: e.event_name, tag: e.event_tag })))}

Allowed icon keys (choose exactly ONE that best fits — do not invent new ones): ${EVENT_ICON_OPTIONS.join(', ')}

Rules:
1. Select at most 8 products from the provided list to feature. Only choose from the given list — never invent a product or id.
2. Keep the title short (under 6 words) and the subtitle to one short sentence.
3. Return valid JSON only, no markdown formatting, no extra text, matching EXACTLY this structure:
{
  "eventName": "String, e.g. Valentine's Day",
  "title": "String, short popup headline",
  "subtitle": "String, one short sentence of marketing copy",
  "badge": "String, short label e.g. Valentine's Special",
  "icon": "one of the allowed icon keys",
  "productIds": ["id1", "id2"]
}`;

    const userPrompt = `Tagged products available: ${JSON.stringify(
      matchingProducts.map(p => ({ id: p.id, name: p.name, category: p.category, event_tags: p.event_tags }))
    )}`;

    let aiResponse;
    try {
      aiResponse = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.3 });
    } catch (aiError) {
      console.error('[SERVICE] Gemini call failed for event ads:', aiError);
      aiResponse = null;
    }

    const validIcon = aiResponse && EVENT_ICON_OPTIONS.includes(aiResponse.icon)
      ? aiResponse.icon
      : 'sparkle';

    const selectedProducts = aiResponse && Array.isArray(aiResponse.productIds)
      ? matchingProducts.filter(p => aiResponse.productIds.includes(p.id))
      : [];

    const finalProducts = selectedProducts.length > 0
      ? selectedProducts
      : matchingProducts.slice(0, 8);

    const primaryEvent = liveEvents[0];

    const eventAdsPayload = {
      active: true,
      event: {
        name: aiResponse?.eventName || primaryEvent.event_name,
        title: aiResponse?.title || `${primaryEvent.event_name} Specials`,
        subtitle: aiResponse?.subtitle || `Check out our specials for ${primaryEvent.event_name}!`,
        badge: aiResponse?.badge || primaryEvent.event_name,
        icon: validIcon,
        endMonth: primaryEvent.end_month,
        endDay: primaryEvent.end_day
      },
      products: finalProducts
    };

    await AiCacheModel.upsert(EVENT_ADS_CACHE_KEY, eventAdsPayload, EVENT_ADS_TTL_MS);
    console.log(`[SERVICE] Event Ads Modal successfully generated and cached for: ${primaryEvent.event_name}`);

    return eventAdsPayload;
  } catch (error) {
    console.error('[SERVICE] Error generating event ads:', error);
    throw error;
  }
};