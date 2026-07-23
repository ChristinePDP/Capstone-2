const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes.js');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'CakeLytics backend is running' });
});

app.use('/api/auth', authRoutes);

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Something went wrong',
  });
});

module.exports = app;