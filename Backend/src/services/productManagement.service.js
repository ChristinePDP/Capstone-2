// backend/services/productManagement.service.js
import { supabase } from '../config/supabase.js'; 
import { ProductModel } from '../model/product.model.js';
import { OccasionModel } from '../model/occasions.model.js';
import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { AnalyticsCacheModel } from '../model/analyticsCache.model.js'; // Ginagamit para sa Homepage Ads

export const createDatabaseProduct = async (productData) => {
  // Fetch tags dynamically para i-validate ang pinadala ng frontend
  let validTags = [];
  try {
    const occasions = await OccasionModel.findAll();
    const dbTags = occasions.map(o => o.event_tag).filter(Boolean);
    validTags = [...new Set(dbTags)];
  } catch (err) {
    console.error("Error fetching occasions for validation:", err);
  }

  // Kunin yung manual tags galing frontend (kung meron) at i-validate
  let initialTags = [];
  if (productData.event_tags && Array.isArray(productData.event_tags) && productData.event_tags.length > 0) {
    initialTags = productData.event_tags.filter(tag => validTags.includes(tag));
  }

  const productToInsert = {
    name: productData.name,
    category: productData.category,
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
    
    event_tags: initialTags // Isave muna as is (pwedeng empty array)
  };

  try {
    const newProduct = await ProductModel.create([productToInsert]);
    // Supabase usually returns an array for inserts, extract the object
    const createdProduct = Array.isArray(newProduct) ? newProduct[0] : newProduct;

    // event_tags ay fully manual na ngayon — kung ano ang tag na pinili ng
    // owner sa product form, yun na ang isasave. Kung wala siyang pinili,
    // wala talagang tag (walang AI na dadagdag pa dito).
    return createdProduct;
  } catch (productError) {
    throw new Error(`Product Error: ${productError.message}`);
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
// OCCASIONS CRUD (para sa Occasion Manager)
// ============================================================

export const getAllOccasions = async ({ activeOnly = false } = {}) => {
  try {
    return await OccasionModel.findAll({ activeOnly });
  } catch (error) {
    throw new Error(`Service Error (getAllOccasions): ${error.message}`);
  }
};

export const getOccasionById = async (id) => {
  try {
    return await OccasionModel.findById(id);
  } catch (error) {
    throw new Error(`Service Error (getOccasionById): ${error.message}`);
  }
};

export const createOccasion = async (occasionData) => {
  const occasionToInsert = {
    event_name: occasionData.event_name,
    event_tag: occasionData.event_tag,
    start_month: occasionData.start_month,
    start_day: occasionData.start_day,
    end_month: occasionData.end_month,
    end_day: occasionData.end_day,
    is_active: occasionData.is_active ?? true
  };

  try {
    return await OccasionModel.create(occasionToInsert);
  } catch (error) {
    throw new Error(`Service Error (createOccasion): ${error.message}`);
  }
};

export const updateOccasion = async (id, occasionData) => {
  const occasionToUpdate = {
    event_name: occasionData.event_name,
    event_tag: occasionData.event_tag,
    start_month: occasionData.start_month,
    start_day: occasionData.start_day,
    end_month: occasionData.end_month,
    end_day: occasionData.end_day,
    is_active: occasionData.is_active
  };

  Object.keys(occasionToUpdate).forEach((key) => {
    if (occasionToUpdate[key] === undefined) delete occasionToUpdate[key];
  });

  try {
    return await OccasionModel.update(id, occasionToUpdate);
  } catch (error) {
    throw new Error(`Service Error (updateOccasion): ${error.message}`);
  }
};

export const deleteOccasion = async (id) => {
  try {
    return await OccasionModel.remove(id);
  } catch (error) {
    throw new Error(`Service Error (deleteOccasion): ${error.message}`);
  }
};

// ============================================================
// HOMEPAGE AI ADVERTISEMENT GENERATOR
// ============================================================

// Fixed theme na palaging ginagamit ngayon — wala nang per-occasion na theme.
// Baguhin na lang dito ang copy/colors kung gusto mo ng ibang look para sa
// Best Sellers section.
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
    // 1. Fetch Active Products with their Total Sales (Order Items Join)
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

    // Linisin at i-compute ang total sold per product
    const productsWithSales = productsData.map(p => {
      const totalSold = p.order_items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const { order_items, ...cleanProduct } = p;
      return { ...cleanProduct, total_sold: totalSold };
    });

    // 2. Laging kunin ang top 5 pinakabenta na produkto — regardless kung
    // may active occasion/event man o wala.
    const topProducts = productsWithSales
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 5);

    const homepageAds = {
      theme: BEST_SELLERS_THEME,
      products: topProducts
    };

    // 3. I-save sa Analytics Cache (same shape gaya ng dati, kaya hindi na
    // kailangang galawin ang controller o ang Home.jsx sa frontend)
    const CACHE_KEY = 'homepage_ad_recommendations';
    const TTL_MS = 24 * 60 * 60 * 1000; 

    await AnalyticsCacheModel.upsert(CACHE_KEY, homepageAds, TTL_MS);
    console.log(`[SERVICE] Homepage Ads (Best Sellers) successfully generated and cached.`);

    return homepageAds;
  } catch (error) {
    console.error(`[SERVICE] Error generating homepage ads:`, error);
    throw error;
  }
};

// ============================================================
// EVENT ADS MODAL (hiwalay sa Best Sellers homepage section)
// ============================================================
// Ito yung mag-a-analyze kung may "live" na occasion ngayon base sa
// start/end date sa 'occasions' table (hal. Valentine's Feb 1-21). Kapag
// meron, ipapa-curate sa AI ang marketing copy + product picks (galing
// lang sa mga produktong naka-tag na sa occasion na iyon), at isasave sa
// hiwalay na cache key na 'event_ads_homepage'. Kapag walang live occasion,
// icle-clear ang cache (active: false) para hindi lumabas ang modal.

const EVENT_ADS_CACHE_KEY = 'event_ads_homepage';
const EVENT_ADS_TTL_MS = 24 * 60 * 60 * 1000;
const EVENT_ADS_INACTIVE_PAYLOAD = { active: false };

// Fixed na listahan ng allowed icon keys — ang AI ang pipili kung alin
// dito ang pinaka-bagay sa occasion, pero HINDI siya puwedeng mag-imbento
// ng bagong icon key. Ang frontend (eventAdsModal.jsx) ang may hawak ng
// aktwal na icon component + accent color per key, kaya laging
// consistent at maganda ang design kahit ano pa ang piliin ng AI.
const EVENT_ICON_OPTIONS = [
  'heart', 'gift', 'cake', 'sparkle', 'star',
  'snowflake', 'ghost', 'flower', 'party'
];

// Tinitignan kung ang 'today' ay nasa loob ng start_month/day - end_month/day
// range ng isang occasion. Sinusuportahan din ang range na tumatawid ng
// bagong taon (hal. Dec 20 - Jan 10).
const isOccasionLiveToday = (occasion, today) => {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const current = month * 100 + day;
  const start = (occasion.start_month || 1) * 100 + (occasion.start_day || 1);
  const end = (occasion.end_month || 12) * 100 + (occasion.end_day || 31);

  if (start <= end) {
    return current >= start && current <= end;
  }
  // Tumatawid ng taon (e.g. Dec 20 hanggang Jan 10)
  return current >= start || current <= end;
};

export const generateEventAds = async () => {
  try {
    const today = new Date();

    // 1. Alamin kung may occasion na "live" ngayon
    const occasions = await OccasionModel.findAll({ activeOnly: true });
    const liveOccasions = occasions.filter(o => isOccasionLiveToday(o, today));

    if (liveOccasions.length === 0) {
      await AnalyticsCacheModel.upsert(EVENT_ADS_CACHE_KEY, EVENT_ADS_INACTIVE_PAYLOAD, EVENT_ADS_TTL_MS);
      console.log('[SERVICE] Walang live occasion ngayon. Event Ads cache cleared.');
      return EVENT_ADS_INACTIVE_PAYLOAD;
    }

    // 2. Kunin lahat ng active products na naka-tag sa alinman sa mga live occasion
    const liveTags = liveOccasions.map(o => o.event_tag).filter(Boolean);

    const { data: productsData, error: prodError } = await supabase
      .from('products')
      .select('id, name, category, price, image_url, pricing_mode, price_matrix, event_tags')
      .eq('is_active', true);

    if (prodError) throw prodError;

    const matchingProducts = (productsData || []).filter(
      p => Array.isArray(p.event_tags) && p.event_tags.some(tag => liveTags.includes(tag))
    );

    if (matchingProducts.length === 0) {
      await AnalyticsCacheModel.upsert(EVENT_ADS_CACHE_KEY, EVENT_ADS_INACTIVE_PAYLOAD, EVENT_ADS_TTL_MS);
      console.log('[SERVICE] May live occasion pero walang naka-tag na products. Event Ads cache cleared.');
      return EVENT_ADS_INACTIVE_PAYLOAD;
    }

    // 3. Ipa-curate sa AI ang marketing copy + pipiliin kung alin sa mga
    // naka-tag na products ang i-feature (max 8), pati na rin ang pinaka-
    // bagay na icon key para sa occasion na ito.
    const systemPrompt = `You are the marketing copywriter for Aileen and Niculus Cake Shop, a Filipino bakeshop. There is currently a live occasion/event happening. Write short, warm marketing copy for a homepage popup (modal) announcing it, and pick which of the given already-tagged products to feature.

Live Occasion(s): ${JSON.stringify(liveOccasions.map(o => ({ name: o.event_name, tag: o.event_tag })))}

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

    // I-validate ang AI output — huwag magtiwala nang bulag dito. Kung
    // walang laman o mali ang format, gagamit na lang tayo ng safe defaults
    // galing mismo sa occasion data, at ang unang ilang naka-tag na products.
    const validIcon = aiResponse && EVENT_ICON_OPTIONS.includes(aiResponse.icon)
      ? aiResponse.icon
      : 'sparkle';

    const selectedProducts = aiResponse && Array.isArray(aiResponse.productIds)
      ? matchingProducts.filter(p => aiResponse.productIds.includes(p.id))
      : [];

    const finalProducts = selectedProducts.length > 0
      ? selectedProducts
      : matchingProducts.slice(0, 8);

    const primaryOccasion = liveOccasions[0];

    const eventAdsPayload = {
      active: true,
      event: {
        name: aiResponse?.eventName || primaryOccasion.event_name,
        title: aiResponse?.title || `${primaryOccasion.event_name} Specials`,
        subtitle: aiResponse?.subtitle || `Check out our specials for ${primaryOccasion.event_name}!`,
        badge: aiResponse?.badge || primaryOccasion.event_name,
        icon: validIcon,
        endMonth: primaryOccasion.end_month,
        endDay: primaryOccasion.end_day
      },
      products: finalProducts
    };

    // 4. I-save sa hiwalay na cache key — hindi ito nagsasalo sa
    // 'homepage_ad_recommendations' na ginagamit ng Best Sellers section.
    await AnalyticsCacheModel.upsert(EVENT_ADS_CACHE_KEY, eventAdsPayload, EVENT_ADS_TTL_MS);
    console.log(`[SERVICE] Event Ads Modal successfully generated and cached for: ${primaryOccasion.event_name}`);

    return eventAdsPayload;
  } catch (error) {
    console.error('[SERVICE] Error generating event ads:', error);
    throw error;
  }
};