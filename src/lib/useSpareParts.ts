import { useMaster } from './masters';
import { supabaseConfigured } from './supabase';
import { accessoriesOf, allPartValues, makePartFit, partOptionsFor } from './partfit';

// ===========================================================================
// THE PARTS TO OFFER ON A CALL: the call's product + its accessories + the
// common parts (partfit.ts). Both spare pickers on a call ask here -- the
// Spare Request and the visit report's consumption -- so the rule lives in
// one place.
//
// Read through the ordinary dropdown cache (useMaster), so both lists are kept
// on the device and the pickers work with no signal. Without the database (the
// sheet bridge) there is no mapping, and the plain part list is used unfiltered.
// ===========================================================================
export function useSpareParts(enabled = true): {
  all: string[];
  forProduct: (product: string) => string[];
  fits: (product: string) => (part: string, code?: string) => boolean;
  accessories: (product: string) => string[];
  ready: boolean;
  failed: boolean;
} {
  const live = supabaseConfigured();
  const parts = useMaster('spareProducts', [], enabled && live);
  const acc = useMaster('productAccessories', [], enabled && live);
  const plain = useMaster('spare', [], enabled && !live);
  if (!live) {
    return {
      all: plain.values, forProduct: () => plain.values, fits: () => () => true, accessories: () => [],
      ready: plain.ready, failed: plain.failed,
    };
  }
  return {
    all: allPartValues(parts.values),
    forProduct: (product) => partOptionsFor(parts.values, acc.values, product),
    fits: (product) => makePartFit(parts.values, acc.values, product),
    accessories: (product) => accessoriesOf(acc.values, product),
    // The accessory list being empty is normal (none saved yet): only the
    // parts decide whether the picker can be used.
    ready: parts.ready,
    failed: parts.failed,
  };
}
