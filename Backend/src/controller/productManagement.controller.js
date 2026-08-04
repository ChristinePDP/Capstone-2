// backend/controllers/productManagement.controller.js
import { createDatabaseProduct, uploadImageToProductBucket } from '../services/productManagement.service.js';

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