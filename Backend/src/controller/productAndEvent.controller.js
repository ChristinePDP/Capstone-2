import { 
  getAllProducts,
  createDatabaseProduct, 
  updateDatabaseProduct,
  deleteDatabaseProduct,
  uploadImageToProductBucket,
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  generateHomepageAds,
  generateEventAds
} from '../services/productAndEvent.service.js';

import { AiCacheModel } from '../model/AiCache.model.js';

// ============================================================
// PRODUCT CRUD
// ============================================================

export const getProducts = async (req, res) => {
  try {
    const products = await getAllProducts(req.query);
    res.status(200).json({
      success: true,
      message: 'Products fetched successfully',
      data: products
    });
  } catch (error) {
    console.error('Fetch Products Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products.',
      error: error.message
    });
  }
};

export const addProduct = async (req, res) => {
  console.log('--- ADD PRODUCT ENDPOINT HIT ---');
  console.log('Incoming Payload:', req.body);

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
    
    console.log('Product Successfully Saved:', savedProduct);

    res.status(201).json({ 
        success: true, 
        message: 'Product added successfully',
        data: savedProduct 
    });
  } catch (error) {
    console.error('Product Creation Error Caught:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Failed to add product.',
        error: error.message 
    });
  }
};

export const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await updateDatabaseProduct(id, req.body);
    res.status(200).json({ 
      success: true, 
      message: 'Product updated successfully', 
      data: updatedProduct 
    });
  } catch (error) {
    console.error('Product Update Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update product.', 
      error: error.message 
    });
  }
};

export const removeProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await deleteDatabaseProduct(id);
    res.status(200).json({ 
      success: true, 
      message: 'Product deleted successfully', 
      data: deletedProduct 
    });
  } catch (error) {
    console.error('Product Delete Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete product.', 
      error: error.message 
    });
  }
};

export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const publicUrl = await uploadImageToProductBucket(req.file);
    res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Product Image Upload Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload product image' });
  }
};

// ============================================================
// EVENTS CRUD
// ============================================================

export const getEvents = async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const events = await getAllEvents({ activeOnly });

    res.status(200).json({
      success: true,
      message: 'Events fetched successfully',
      data: events
    });
  } catch (error) {
    console.error('Get Events Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events.',
      error: error.message
    });
  }
};

export const getEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await getEventById(id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Event fetched successfully',
      data: event
    });
  } catch (error) {
    console.error('Get Event Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event.',
      error: error.message
    });
  }
};

export const addEvent = async (req, res) => {
  console.log('--- ADD EVENT ENDPOINT HIT ---');
  console.log('Incoming Payload:', req.body);

  try {
    const eventData = req.body;

    if (!eventData.event_name || !eventData.event_tag) {
      console.log('Validation Failed: Missing required fields.');
      return res.status(400).json({
        success: false,
        message: 'Event name and AI recommendation tag are required fields.'
      });
    }

    const savedEvent = await createEvent(eventData);
    console.log('Event Successfully Saved:', savedEvent);

    res.status(201).json({
      success: true,
      message: 'Event added successfully',
      data: savedEvent
    });
  } catch (error) {
    console.error('Event Creation Error Caught:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add event.',
      error: error.message
    });
  }
};

export const editEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const eventData = req.body;

    const updatedEvent = await updateEvent(id, eventData);

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      data: updatedEvent
    });
  } catch (error) {
    console.error('Event Update Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update event.',
      error: error.message
    });
  }
};

export const removeEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedEvent = await deleteEvent(id);

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully',
      data: deletedEvent
    });
  } catch (error) {
    console.error('Event Delete Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete event.',
      error: error.message
    });
  }
};

// ============================================================
// ADS GENERATORS
// ============================================================

export const getHomepageAds = async (req, res) => {
  try {
    const cachedData = await AiCacheModel.getByKey('homepage_ad_recommendations');
    
    if (!cachedData) {
      return res.status(404).json({ success: false, message: 'Ads not yet generated' });
    }

    res.status(200).json({ success: true, data: cachedData.payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEventAds = async (req, res) => {
  try {
    const cachedData = await AiCacheModel.getByKey('event_ads_homepage');

    if (!cachedData || !cachedData.payload || cachedData.payload.active === false) {
      return res.status(200).json({ success: true, data: { active: false } });
    }

    res.status(200).json({ success: true, data: cachedData.payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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