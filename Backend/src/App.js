import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser'; 

import authRoutes from './routes/auth.routes.js'; 
import inventoryRoutes from './routes/inventory.routes.js'; 
import analyticsRoutes from './routes/analytics.routes.js';
import onlineOrderingRoutes from './routes/onlineOrdering.routes.js';
import qrScaner from './routes/Qr.routes.js';
import posRoutes from './routes/pos.routes.js';
// Updated import path and variable name
import productAndEventRoutes from './routes/productAndEvent.routes.js';
import ordersRoutes from './routes/orders.routes.js'; 
import { errorHandler } from './middleware/errorHandler.js'; 
import { authMiddlewareJwt } from './middleware/auth.middleware.js';

const app = express(); 

app.use(cors({
  origin: true, 
  credentials: true 
}));

app.use(express.json()); 
app.use(cookieParser());

app.use((req, res, next) => { 
  const timestamp = new Date().toISOString();
  console.log(` ${req.method} ${req.url}`); 
  if (req.method === 'POST' || req.method === 'PATCH') { 
    console.log('Body:', JSON.stringify(req.body)); 
  }
  next();
});

app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.json({ status: 'CakeLytics backend is running' }));

app.use('/api', authRoutes); 
app.use('/api/inventory', inventoryRoutes); 
app.use('/api/allOrders', ordersRoutes); 
app.use('/api/analytics', analyticsRoutes); 
app.use('/api/online-ordering', onlineOrderingRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/Qr', qrScaner);

// Updated route usage
app.use('/api/online-ordering/products', productAndEventRoutes);
app.use(errorHandler);

export default app;