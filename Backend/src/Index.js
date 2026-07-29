import 'dotenv/config';
import app from './App.js'; // Wag kalimutan ang .js!
import { setupAnalyticsCron } from './cron/analytics.cron.js';

const PORT = process.env.PORT || 4000;

setupAnalyticsCron();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});