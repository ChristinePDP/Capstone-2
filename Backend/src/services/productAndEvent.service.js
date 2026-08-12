import { supabase } from '../config/supabase.js'; 
import { ProductModel } from '../model/product.model.js';
import { OccasionModel } from '../model/occasions.model.js'; 
import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { AnalyticsCacheModel } from '../model/analyticsCache.model.js'; 

// ============================================================
// PRODUCT CRUD SERVICES
// ============================================================

export const getAllProducts = async (filters = {}) => {
  try {
    const { data, error } = await ProductModel.findAll(filters);
    if (error) throw error;
    return data;
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
    event_tags: initialTags 
  };

  try {
    const response = await ProductModel.create([productToInsert]);
    
    // Check if Supabase returned a constraint error
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
    event_tags: productData.event_tags ? productData.event_tags.filter(tag => validTags.includes(tag)) : []
  };

  Object.keys(productToUpdate).forEach((key) => {
    if (productToUpdate[key] === undefined) delete productToUpdate[key];
  });

  try {
    const response = await ProductModel.update(id, productToUpdate);

    // Check if Supabase returned a constraint error
    if (response.error) throw new Error(response.error.message);

    return response.data;
  } catch (error) {
    throw new Error(`Service Error (updateDatabaseProduct): ${error.message}`);
  }
};

export const deleteDatabaseProduct = async (id) => {
  try {
    const response = await ProductModel.delete(id);
    if (response.error) throw new Error(response.error.message);
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

    await AnalyticsCacheModel.upsert(CACHE_KEY, homepageAds, TTL_MS);
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
  const current = month * 100 + day;
  const start = (event.start_month || 1) * 100 + (event.start_day || 1);
  const end = (event.end_month || 12) * 100 + (event.end_day || 31);

  if (start <= end) {
    return current >= start && current <= end;
  }
  return current >= start || current <= end;
};

export const generateEventAds = async () => {
  try {
    const today = new Date();

    const events = await OccasionModel.findAll({ activeOnly: true });
    const liveEvents = events.filter(e => isEventLiveToday(e, today));

    if (liveEvents.length === 0) {
      await AnalyticsCacheModel.upsert(EVENT_ADS_CACHE_KEY, EVENT_ADS_INACTIVE_PAYLOAD, EVENT_ADS_TTL_MS);
      console.log('[SERVICE] Walang live event ngayon. Event Ads cache cleared.');
      return EVENT_ADS_INACTIVE_PAYLOAD;
    }

    const liveTags = liveEvents.map(e => e.event_tag).filter(Boolean);

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

    await AnalyticsCacheModel.upsert(EVENT_ADS_CACHE_KEY, eventAdsPayload, EVENT_ADS_TTL_MS);
    console.log(`[SERVICE] Event Ads Modal successfully generated and cached for: ${primaryEvent.event_name}`);

    return eventAdsPayload;
  } catch (error) {
    console.error('[SERVICE] Error generating event ads:', error);
    throw error;
  }
};