import 'dotenv/config';
import app from './App.js'; 
import { setupAnalyticsCron } from './cron/analytics.cron.js';

const PORT = process.env.PORT || 4000;

// Bumalik na — tatakbo ito habang buhay ang server, walang extra Render service.
setupAnalyticsCron();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});