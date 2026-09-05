import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import type { FieldDef, FieldOption } from '../components/form/Form';
import { setEngineerNamesCache } from '../lib/format';
import { supabaseConfigured, sbDirectoryNames, type ComplaintSuggestion } from '../lib/supabase';
import { ComplaintSuggest } from '../components/form/ComplaintSuggest';
import { ComplaintTextHelp } from '../components/form/ComplaintTextHelp';

// ===========================================================================
// THE CALL FORM'S LIVE LISTS, IN ONE PLACE.
//
// A call is registered from THREE screens — New Field Call, the Register panel
// on a pending request, and the edit drawer that opens before a request is
// mapped — and it is the same form each time. The lists it needs are not in the
// schema, because they come from the masters and the directory at render:
//
//   Party Name         → the Party Master, as a datalist
//   Complaint Reported → the alarm number in this product's spelling, and the
//                        phrasings the register already uses (0107)
//   Standard Complaint → the master as a dropdown, with the suggestions from
//                        past calls underneath it
//   Call Allocated To  → the active User Master directory
//
// This lived inside the Field Calls screen, so the other two got none of it:
// Standard Complaint was a bare text box with no list and no suggestions, and
// Call Allocated To was an EMPTY dropdown. That is the bug this file exists to
// stop repeating — the schema is shared already, so the lists have to be too.
// ===========================================================================

export function useCallFieldMasters(): {
  inject: (fs: FieldDef[]) => FieldDef[];
  offered: MutableRefObject<ComplaintSuggestion[]>;
} {
  const { users } = useAuth();
  const partyMaster = useMaster('party');
  const complaintMaster = useMaster('complaint');

  // "Call Allocated To" comes from the User Master, not the demo users: the
  // directory names (user_directory) plus the real login profiles, deduped.
  const [engineerNames, setEngineerNames] = useState<FieldOption[]>([]);
  useEffect(() => {
    let alive = true;
    const fromProfiles = users.map((u) => (u.fullName || '').trim()).filter(Boolean);
    const build = (dir: string[]) => {
      const seen = new Set<string>();
      const out: FieldOption[] = [];
      [...dir, ...fromProfiles].forEach((n) => {
        const v = n.trim(); const k = v.toLowerCase();
        if (v && !seen.has(k)) { seen.add(k); out.push({ value: v, label: v }); }
      });
      out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
      return out;
    };
    const apply = (opts: FieldOption[]) => { setEngineerNames(opts); setEngineerNamesCache(opts.map((o) => String(o.value))); };
    if (!supabaseConfigured()) { apply(build([])); return; }
    void sbDirectoryNames().then((dir) => { if (alive) apply(build(dir)); }).catch(() => { if (alive) apply(build([])); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // What was offered on this form, so what is ultimately CHOSEN can be compared
  // with it. Held in a ref rather than state: it must not re-render the form,
  // and it is read once, at submit.
  const offered = useRef<ComplaintSuggestion[]>([]);

  // FIVE HUNDRED AND SEVEN values in that dropdown, of which any one product has
  // ever used about sixty. The register already knows what was chosen the last
  // dozen times somebody described this fault in these words — so it offers,
  // and the person decides.
  //
  // THE SUGGESTIONS ARE ATTACHED WHETHER OR NOT THE MASTER LOADED. They come
  // from past CALLS, not from the master, so they are valid values either way —
  // and a master that has not loaded is precisely when somebody needs the help
  // most.
  const complaintSuggestions: FieldDef['below'] = ({ values, set }) => (
    <ComplaintSuggest
      reported={String(values.complaintReported ?? '')}
      product={String(values.productName ?? '')}
      current={String(values.standardComplaint ?? '')}
      onPick={(v) => set('standardComplaint', v)}
      onOffer={(l) => { offered.current = l; }}
    />
  );

  // Standard Complaint is a MASTER list, so it is CHOSEN, not typed. The select
  // renderer keeps a value the record already carries even when it is not on the
  // list, so an imported call is never silently rewritten by opening it.
  //
  // When the master has no values the field falls back to free text and SAYS
  // why. A picker that is simply empty looks like a broken screen; the thing to
  // fix is the list, and the form should point at it. (The go-live reset
  // TRUNCATES `masters`, so every value list comes back empty until it is
  // re-loaded — that is what this note is usually telling you.)
  const complaintField = (f: FieldDef): FieldDef =>
    complaintMaster.values.length
      ? {
        ...f,
        type: 'select' as const,
        options: complaintMaster.values.map((v) => ({ value: v, label: v })),
        below: complaintSuggestions,
      }
      : {
        ...f,
        below: complaintSuggestions,
        help: complaintMaster.ready
          ? 'The Standard Complaint master has no values — add them under Masters, or Admin → Bulk Uploads → Master Value Lists. The suggestions below still work: they come from past calls.'
          : 'Loading the Standard Complaint master…',
      };

  // The wording ITSELF, one field earlier: the alarm number in this product's
  // spelling, and how the fault has been written here before (0107).
  const reportedHelp: FieldDef['below'] = ({ values, set }) => (
    <ComplaintTextHelp
      reported={String(values.complaintReported ?? '')}
      product={String(values.productName ?? '')}
      onPick={(v) => set('complaintReported', v)}
    />
  );

  const inject = (fs: FieldDef[]) =>
    fs.map((f) =>
      f.name === 'partyName' ? { ...f, datalist: partyMaster.values }
        : f.name === 'standardComplaint' ? complaintField(f)
          : f.name === 'complaintReported' ? { ...f, below: reportedHelp }
            : f.name === 'allocatedTo' ? { ...f, options: engineerNames }
              : f);

  return { inject, offered };
}
