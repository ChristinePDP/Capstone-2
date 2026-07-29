// ============================================================
// PerformancetTimeframeHelper.utils.js (FIXED)
// ============================================================

const formatDate = (date, isEnd = false) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  
  // Return format: YYYY-MM-DD HH:mm:ss
  if (isEnd) return `${y}-${m}-${d} 23:59:59`;
  return `${y}-${m}-${d} 00:00:00`;
};

const getDateRange = (period) => {
  const now = new Date();

  switch (period) {
    case 'Today':
      return { startDate: formatDate(now), endDate: formatDate(now, true) };

    case 'Yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { startDate: formatDate(y), endDate: formatDate(y, true) };
    }

    case 'Last 7 Days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { startDate: formatDate(start), endDate: formatDate(now, true) };
    }

    case 'Last Month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: formatDate(start), endDate: formatDate(end, true) };
    }

    case 'This Month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: formatDate(start), endDate: formatDate(now, true) };
    }

    case 'This Year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: formatDate(start), endDate: formatDate(now, true) };
    }

    default: {
      if (period && period.includes(' - ')) {
        const [s, e] = period.split(' - ');
        // I-force ang date sa YYYY-MM-DD format bago i-format
        return { startDate: formatDate(new Date(s)), endDate: formatDate(new Date(e), true) };
      }
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { startDate: formatDate(start), endDate: formatDate(now, true) };
    }
  }
};

export { getDateRange };