import 'dotenv/config';
import app from './App.js'; 
import { startRealtimeBridge } from './services/realtime.service.js';
import { setupCheckoutReservationCron } from './cron/checkoutReservation.cron.js';

const PORT = process.env.PORT || 4000;

startRealtimeBridge();
setupCheckoutReservationCron();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
