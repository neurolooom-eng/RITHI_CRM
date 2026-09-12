// ===========================================================================
// THE SIGNATURE ON A DOCUMENT.
//
// One rule, in one place, because it is the rule that makes a saved signature
// mean anything:
//
//   A DOCUMENT PRINTS YOUR SIGNATURE ONLY IN THE BLOCK THAT NAMES YOU.
//
// Any other block prints empty, to be signed by hand exactly as it is today.
// The alternative — a system that reaches for whoever's mark the block calls
// for — is a system that signs documents on people's behalf, and a mark applied
// by software to a record somebody else is accountable for is not a signature.
//
// This is also why the storage (0172) lets nobody read anybody else's: the rule
// here is not a policy decision that could be relaxed later on a screen, it is
// the only thing the data permits.
// ===========================================================================
import { useEffect, useState } from 'react';
import { sbMySignature, supabaseConfigured, type MySignature } from './supabase';

/** The signed-in user's saved signature, or null. Loaded once per mount. */
export function useMySignature(): MySignature | null {
  const [sig, setSig] = useState<MySignature | null>(null);
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let live = true;
    // A failure here is "no signature", never a broken document: a challan that
    // will not print because a signature could not be read is a worse outcome
    // than one printed with an empty block, which is what the form has always
    // had.
    void sbMySignature().then((s) => { if (live) setSig(s); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return sig;
}

/**
 * Is `blockName` this person? Compared on the NAME the block prints, because
 * that is all a document carries — the dispatch head stores `dispatched_by` as
 * text, not as a user id.
 *
 * Deliberately strict: case and surrounding space are ignored, nothing else.
 * A looser match (initials, "contains") is how one person's signature ends up
 * on another's document — "S Kumar" matching "Sanjay Kumar" and "Suresh Kumar"
 * alike. Where the names differ at all, the block prints empty and somebody
 * signs it, which is the safe direction to be wrong in.
 */
export function signatureBelongsTo(blockName: unknown, me: { fullName?: string; email?: string } | null): boolean {
  const a = String(blockName ?? '').trim().toLowerCase();
  if (!a) return false;
  const name = String(me?.fullName ?? '').trim().toLowerCase();
  const email = String(me?.email ?? '').trim().toLowerCase();
  return (!!name && a === name) || (!!email && a === email);
}
