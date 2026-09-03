import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser'; 

import authRoutes from './routes/auth.routes.js'; 
import inventoryRoutes from './routes/inventory.routes.js'; 
import analyticsRoutes from './routes/analytics.routes.js';
import aiAnalyticsRoutes from './routes/aiAnalytics.routes.js';
import onlineOrderingRoutes from './routes/onlineOrdering.routes.js';
import qrScaner from './routes/Qr.routes.js';
import posRoutes from './routes/pos.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import productAndEventRoutes from './routes/productAndEvent.routes.js';
import ordersRoutes from './routes/orders.routes.js'; 
import { errorHandler } from './middleware/errorHandler.js'; 
import { authMiddlewareJwt } from './middleware/auth.middleware.js';
import { handlePaymongoWebhook } from './controller/onlineOrdering.controller.js';

const app = express(); 

// FIXED: dating `origin: true` ay nag-a-allow ng credentials mula kahit saang site.
// Ngayon, isang tiyak na domain lang (galing env var) ang pinapayagan.
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://capstone-frontend-lake.vercel.app'
  ],
  credentials: true // kailangan ito dahil gumagamit ka ng withCredentials sa axios
}));

// --- PAYMONGO WEBHOOK: DAPAT NASA ITAAS ITO, BAGO ANG express.json() ---
app.post(
  '/api/online-ordering/paymongo-webhook',
  express.raw({ type: 'application/json' }),
  handlePaymongoWebhook
);

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
app.use('/api/analytics', aiAnalyticsRoutes); 
app.use('/api/online-ordering', onlineOrderingRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/Qr', qrScaner);
app.use('/api/notifications', notificationRoutes);
app.use('/api/online-ordering/products', productAndEventRoutes);

app.use(errorHandler);

export default app;
