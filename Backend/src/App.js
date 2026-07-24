import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser'; 

import authRoutes from './routes/auth.routes.js'; 
import inventoryRoutes from './routes/inventory.routes.js'; 
import { errorHandler } from './middleware/errorHandler.js'; 

const app = express(); 

// I-update ang CORS. Kailangan ng specific na origin kapag gumagamit ng credentials.
app.use(cors({
  origin: 'http://localhost:5173', // <-- Palitan kung iba ang port ng frontend mo
  credentials: true // <-- Importante ito para tanggapin ang cookies!
})); 
app.use(express.json()); 
app.use(cookieParser()); // <-- Idagdag ito para mabasa ang req.cookies

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
app.use(errorHandler);

export default app;