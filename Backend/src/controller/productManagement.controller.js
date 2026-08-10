// backend/controllers/productManagement.controller.js
import { createDatabaseProduct, uploadImageToProductBucket } from '../services/productManagement.service.js';
import {
  getAllOccasions,
  getOccasionById,
  createOccasion,
  updateOccasion,
  deleteOccasion,
  generateHomepageAds,
  generateEventAds
} from '../services/productManagement.service.js';

import { AnalyticsCacheModel } from '../model/analyticsCache.model.js';

export const addProduct = async (req, res) => {
  console.log('--- ADD PRODUCT ENDPOINT HIT ---'); // I-log kung na-hit ang endpoint
  console.log('Incoming Payload:', req.body); // I-log kung ano ang natanggap mula sa frontend

  try {
    const productData = req.body;

    if (!productData.name || !productData.price || !productData.category) {
      console.log('Validation Failed: Missing required fields.');
      return res.status(400).json({
        success: false,
        message: 'Name, category, and price are required fields.'
      });
    }

    const savedProduct = await createDatabaseProduct(productData);
    
    console.log('Product Successfully Saved:', savedProduct); // I-log kung success sa database

    res.status(201).json({ 
        success: true, 
        message: 'Product added successfully',
        data: savedProduct 
    });
  } catch (error) {
    console.error('Product Creation Error Caught:', error); // I-log kung may error sa mismong pag-save
    res.status(500).json({ 
        success: false, 
        message: 'Failed to add product.',
        error: error.message 
    });
  }
};

export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Tatawagin natin ang service function para i-upload
    const publicUrl = await uploadImageToProductBucket(req.file);
    res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Product Image Upload Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload product image' });
  }
};

// ============================================================
// OCCASIONS CRUD (para sa Occasion Manager)
// ============================================================

export const getOccasions = async (req, res) => {
  try {
    // ?active=true para active occasions lang (gamit ng homepage/AI recs)
    const activeOnly = req.query.active === 'true';
    const occasions = await getAllOccasions({ activeOnly });

    res.status(200).json({
      success: true,
      message: 'Occasions fetched successfully',
      data: occasions
    });
  } catch (error) {
    console.error('Get Occasions Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch occasions.',
      error: error.message
    });
  }
};

export const getOccasion = async (req, res) => {
  try {
    const { id } = req.params;
    const occasion = await getOccasionById(id);

    if (!occasion) {
      return res.status(404).json({ success: false, message: 'Occasion not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Occasion fetched successfully',
      data: occasion
    });
  } catch (error) {
    console.error('Get Occasion Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch occasion.',
      error: error.message
    });
  }
};

export const addOccasion = async (req, res) => {
  console.log('--- ADD OCCASION ENDPOINT HIT ---');
  console.log('Incoming Payload:', req.body);

  try {
    const occasionData = req.body;

    if (!occasionData.event_name || !occasionData.event_tag) {
      console.log('Validation Failed: Missing required fields.');
      return res.status(400).json({
        success: false,
        message: 'Event name and AI recommendation tag are required fields.'
      });
    }

    const savedOccasion = await createOccasion(occasionData);
    console.log('Occasion Successfully Saved:', savedOccasion);

    res.status(201).json({
      success: true,
      message: 'Occasion added successfully',
      data: savedOccasion
    });
  } catch (error) {
    console.error('Occasion Creation Error Caught:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add occasion.',
      error: error.message
    });
  }
};

export const editOccasion = async (req, res) => {
  try {
    const { id } = req.params;
    const occasionData = req.body;

    const updatedOccasion = await updateOccasion(id, occasionData);

    res.status(200).json({
      success: true,
      message: 'Occasion updated successfully',
      data: updatedOccasion
    });
  } catch (error) {
    console.error('Occasion Update Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update occasion.',
      error: error.message
    });
  }
};

export const removeOccasion = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedOccasion = await deleteOccasion(id);

    res.status(200).json({
      success: true,
      message: 'Occasion deleted successfully',
      data: deletedOccasion
    });
  } catch (error) {
    console.error('Occasion Delete Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete occasion.',
      error: error.message
    });
  }
};

export const getHomepageAds = async (req, res) => {
  try {
    const cachedData = await AnalyticsCacheModel.getByKey('homepage_ad_recommendations');
    
    if (!cachedData) {
      return res.status(404).json({ success: false, message: 'Ads not yet generated' });
    }

    res.status(200).json({ success: true, data: cachedData.payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// EVENT ADS MODAL (hiwalay sa Best Sellers homepage section)
// ============================================================

export const getEventAds = async (req, res) => {
  try {
    const cachedData = await AnalyticsCacheModel.getByKey('event_ads_homepage');

    // Walang cached data pa, o na-clear kasi walang live occasion ngayon —
    // 'active: false' pa rin ang ibalik (hindi error) para consistent lang
    // ang pag-check ng frontend.
    if (!cachedData || !cachedData.payload || cachedData.payload.active === false) {
      return res.status(200).json({ success: true, data: { active: false } });
    }

    res.status(200).json({ success: true, data: cachedData.payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// MANUAL TRIGGERS (para sa testing / admin "regenerate now" button —
// hindi mo kailangang maghintay ng cron o ng totoong petsa ng event)
// ============================================================

export const regenerateHomepageAds = async (req, res) => {
  try {
    const result = await generateHomepageAds();
    res.status(200).json({ success: true, message: 'Homepage ads (best sellers) regenerated.', data: result });
  } catch (error) {
    console.error('Regenerate Homepage Ads Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const regenerateEventAds = async (req, res) => {
  try {
    const result = await generateEventAds();
    res.status(200).json({ success: true, message: 'Event ads regenerated.', data: result });
  } catch (error) {
    console.error('Regenerate Event Ads Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};