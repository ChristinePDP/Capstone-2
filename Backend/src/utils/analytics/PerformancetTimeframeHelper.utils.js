// ============================================================
// PerformancetTimeframeHelper.utils.js (FIXED — timezone-safe)
// ============================================================
//
// DATING BUG: Ang lumang bersyon ay gumagawa ng "naive" datetime
// strings (walang timezone offset, hal. "2026-08-31 00:00:00") gamit
// ang LOCAL Date getters ng Node server (getFullYear/getMonth/
// getDate). Kapag ipinasa ito sa Supabase laban sa isang `timestamptz`
// column, ino-interpret ito ni Postgres gamit ang timezone ng SESSION
// nito (UTC karaniwan sa Supabase) — HINDI ang timezone kung saan
// tumatakbo ang Node server. Kapag magkaiba ang dalawa (hal. server na
// naka-set sa Asia/Manila pero UTC ang DB session), lumilihis ng
// ilang oras ang "Today"/"This Month" boundaries, kaya may mga
// logs/orders na "nawawala" sa fetch kahit totoong-totoo ang datos.
//
// FIX: laging kumukuha muna ng Philippine-calendar na (taon, buwan,
// araw) gamit ang Intl API — hindi ito apektado ng TZ setting ng
// server. Pagkatapos, binubuo ang TUNAY na UTC instant (bilang ISO
// string na may "Z") na katumbas ng simula/dulo ng araw na iyon sa
// Asia/Manila. Dahil real, unambiguous na UTC instant na ang
// ipinapasa, tama na ang comparison sa `timestamptz` column anuman
// ang session timezone ng Supabase/Postgres.
// ============================================================

const PH_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8, walang DST ang Pilipinas

// Kunin ang {y, m, d} sa Philippine calendar ng ibinigay na instant.
const getPHYMD = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { y: Number(map.year), m: Number(map.month) - 1, d: Number(map.day) };
};

// Neutral na "calendar date" object (UTC noon) — ligtas ang
// pag-add/subtract ng araw/buwan dito nang hindi naaapektuhan ng
// DST o timezone ng server.
const toCalendarDate = ({ y, m, d }) => new Date(Date.UTC(y, m, d, 12));
const fromCalendarDate = (date) => ({
  y: date.getUTCFullYear(),
  m: date.getUTCMonth(),
  d: date.getUTCDate(),
});

// Buuin ang tamang UTC ISO instant para sa simula (00:00:00.000) o
// dulo (23:59:59.999) ng isang partikular na araw sa Philippine time.
const phBoundaryISO = ({ y, m, d }, isEnd) => {
  const ms = isEnd
    ? Date.UTC(y, m, d, 23, 59, 59, 999) - PH_OFFSET_MS
    : Date.UTC(y, m, d, 0, 0, 0, 0) - PH_OFFSET_MS;
  return new Date(ms).toISOString();
};

const getDateRange = (period) => {
  const now = new Date();
  const todayYMD = getPHYMD(now);
  const todayCal = toCalendarDate(todayYMD);

  switch (period) {
    case 'Today':
      return {
        startDate: phBoundaryISO(todayYMD, false),
        endDate: phBoundaryISO(todayYMD, true),
      };

    case 'Yesterday': {
      const cal = new Date(todayCal);
      cal.setUTCDate(cal.getUTCDate() - 1);
      const ymd = fromCalendarDate(cal);
      return { startDate: phBoundaryISO(ymd, false), endDate: phBoundaryISO(ymd, true) };
    }

    case 'Last 7 Days': {
      const startCal = new Date(todayCal);
      startCal.setUTCDate(startCal.getUTCDate() - 6);
      const startYMD = fromCalendarDate(startCal);
      return { startDate: phBoundaryISO(startYMD, false), endDate: phBoundaryISO(todayYMD, true) };
    }

    case 'Last Month': {
      const startCal = new Date(Date.UTC(todayYMD.y, todayYMD.m - 1, 1, 12));
      const endCal = new Date(Date.UTC(todayYMD.y, todayYMD.m, 0, 12)); // huling araw ng nakaraang buwan
      return {
        startDate: phBoundaryISO(fromCalendarDate(startCal), false),
        endDate: phBoundaryISO(fromCalendarDate(endCal), true),
      };
    }

    case 'This Month': {
      const startYMD = { y: todayYMD.y, m: todayYMD.m, d: 1 };
      return { startDate: phBoundaryISO(startYMD, false), endDate: phBoundaryISO(todayYMD, true) };
    }

    case 'This Year': {
      const startYMD = { y: todayYMD.y, m: 0, d: 1 };
      return { startDate: phBoundaryISO(startYMD, false), endDate: phBoundaryISO(todayYMD, true) };
    }

    default: {
      if (period && period.includes(' - ')) {
        const [s, e] = period.split(' - ');
        const sYMD = getPHYMD(new Date(s));
        const eYMD = getPHYMD(new Date(e));
        return { startDate: phBoundaryISO(sYMD, false), endDate: phBoundaryISO(eYMD, true) };
      }
      const startCal = new Date(todayCal);
      startCal.setUTCDate(startCal.getUTCDate() - 6);
      const startYMD = fromCalendarDate(startCal);
      return { startDate: phBoundaryISO(startYMD, false), endDate: phBoundaryISO(todayYMD, true) };
    }
  }
};

export { getDateRange };