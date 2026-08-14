import * as posService from '../services/pos.service.js';

export const getPosProducts = async (req, res, next) => {
  try {
    const filters = req.query;
    const products = await posService.getPosProducts(filters);
    
    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    next(error);
  }
};

export const createPosOrder = async (req, res, next) => {
  try {
    const payload = req.body;
    const newOrder = await posService.createPosOrder(payload);
    
    res.status(201).json({
      success: true,
      message: 'POS Order successfully created',
      data: newOrder
    });
  } catch (error) {
    next(error);
  }
};