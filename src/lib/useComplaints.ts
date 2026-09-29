import { useMaster } from './masters';
import { supabaseConfigured } from './supabase';
import { complaintOptionsFor, decodeComplaintEntry } from './complaints';

// ===========================================================================
// THE STANDARD COMPLAINT DROPDOWN FOR A CALL: the complaints mapped to the
// call's product plus those mapped to all products (the user, 2026-09-29).
// Every call form asks here, so the rule lives in one place.
//
// Read through the ordinary dropdown cache (useMaster), so it is kept on the
// device and works with no signal like every other list. Without the database
// (the sheet bridge) there is no mapping to read, and the plain list is used.
// ===========================================================================
export function useComplaints(): {
  all: string[];
  forProduct: (product: string) => string[];
  ready: boolean;
  failed: boolean;
} {
  const live = supabaseConfigured();
  const mapped = useMaster('complaintProducts', [], live);
  const plain = useMaster('complaint', [], !live);
  if (!live) return { all: plain.values, forProduct: () => plain.values, ready: plain.ready, failed: plain.failed };
  const all = mapped.values.map((e) => decodeComplaintEntry(e).value);
  return {
    all,
    forProduct: (product: string) => complaintOptionsFor(mapped.values, product),
    ready: mapped.ready,
    failed: mapped.failed,
  };
}
