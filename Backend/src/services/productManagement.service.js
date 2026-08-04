// backend/services/productManagement.service.js
import { supabase } from '../config/supabase.js'; 
import { ProductModel } from '../model/product.model.js';

export const createDatabaseProduct = async (productData) => {
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
    price_matrix: productData.price_matrix || []
  };

  try {
    const newProduct = await ProductModel.create([productToInsert]);
    return newProduct;
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