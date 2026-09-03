import 'dotenv/config';
import app from './App.js'; 
// Cron scheduling ay inalis dito. Ang trigger ngayon ay HTTP POST papuntang
// /api/internal/run-analytics, na tinatawag ng Render Cron Job (see analytics.cron.js).

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});