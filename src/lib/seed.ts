import { db } from './db';
import { C } from '../modules/collections';

// Business collections that used to hold demo/dummy data. The app now uses the
// live Google Sheets, so these are cleared once (kept: sheet caches & users).
const DEMO_COLLECTIONS = [
  C.parties, C.products, C.parts, C.warranties, C.contracts, C.installations,
  C.pmcalls, C.breakdowns, C.spareRequests, C.spareConsumption, C.feedback,
  C.quotes, C.invoices, 'templates',
];

export function clearDemoData() {
  try {
    if (localStorage.getItem('rithi.demoCleared') === '1') return;
    DEMO_COLLECTIONS.forEach((c) => {
      localStorage.removeItem('rithi.db.' + c);
      db.replaceAll(c, []);
    });
    localStorage.setItem('rithi.demoCleared', '1');
  } catch { /* ignore */ }
}
