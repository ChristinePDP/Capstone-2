const TIMEFRAME_DAYS = { "7d": 7, "30d": 30, "60d": 60 };
const DEFAULT_TIMEFRAME = "30d";

function getDaysFromTimeframe(timeframe) {
  return TIMEFRAME_DAYS[timeframe] || TIMEFRAME_DAYS[DEFAULT_TIMEFRAME];
}

function getLookbackDateRange(days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
}

export { TIMEFRAME_DAYS, DEFAULT_TIMEFRAME, getDaysFromTimeframe, getLookbackDateRange };