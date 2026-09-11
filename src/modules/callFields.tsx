import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import type { FieldDef, FieldOption } from '../components/form/Form';
import { setEngineerNamesCache } from '../lib/format';
import { supabaseConfigured, sbDirectoryNames, listRegistrantDesks, sbSearchPartiesForCall, sbSearchPartiesForInstall, partyOwnsNoMachine, type ComplaintSuggestion } from '../lib/supabase';
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
//   Created By         → the Hotline desk the database will file the call to
//   Actually Reg. By   → the signed-in person, which is what it will stamp
//
// This lived inside the Field Calls screen, so the other two got none of it:
// Standard Complaint was a bare text box with no list and no suggestions, and
// Call Allocated To was an EMPTY dropdown. That is the bug this file exists to
// stop repeating — the schema is shared already, so the lists have to be too.
// ===========================================================================

export function useCallFieldMasters(opts: { newPartyAllowed?: boolean } = {}): {
  inject: (fs: FieldDef[]) => FieldDef[];
  offered: MutableRefObject<ComplaintSuggestion[]>;
} {
  const { user, users } = useAuth();
  // The maintained master is still read, but ONLY where a new customer is
  // legitimate: an INSTALLATION reaches somebody who has no machine yet, so
  // there is nothing in the product register to find them by. Everywhere else
  // the machines are looked up BY this name, so a party that owns none is not
  // an answer.
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

  // WHO THE CALL WILL BE FILED TO, shown before it is saved rather than after.
  // Both fields are read-only and the DATABASE fills them on insert (0114) —
  // these are the same two values, fetched so the form is not blank about a
  // fact it already knows. They are `defaultValue`s, so an existing call opened
  // for edit keeps what it actually carries: `initial` beats `defaultValue`.
  const [deskName, setDeskName] = useState('');
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let alive = true;
    void listRegistrantDesks()
      .then((d) => { if (alive) setDeskName(d.find((x) => x.is_default)?.name ?? ''); })
      .catch(() => { /* the form still saves; the database decides either way */ });
    return () => { alive = false; };
  }, []);
  const meName = (user?.fullName || user?.email || '').trim();

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
  // ALWAYS THE PICKER, NEVER FREE TEXT (the user, 2026-09-09: "No fall back to
  // Free text"). It used to fall back to a plain box when the master had no
  // values, which was the wrong shape of help: a Standard Complaint typed by
  // hand is a master entry that does not exist, and every count, filter and
  // frequent-failure match downstream is done on that value. An empty master is
  // a MASTER problem, so the field says so and stays a picker rather than
  // quietly accepting anything.
  const complaintField = (f: FieldDef): FieldDef => ({
    ...f,
    type: 'select' as const,
    allowFreeText: false,
    options: complaintMaster.values.map((v) => ({ value: v, label: v })),
    below: complaintSuggestions,
    // The go-live reset TRUNCATES `masters`, so every value list comes back
    // empty until it is re-loaded — that is what this note is usually telling
    // you. The suggestions below still work either way: they come from past
    // CALLS, not from the master, so they are valid values even when it is bare.
    help: complaintMaster.values.length ? undefined
      : complaintMaster.ready
        ? 'The Standard Complaint master has no values — add them under Masters, or Admin → Bulk Uploads → Master Value Lists. The suggestions below still work: they come from past calls.'
        : 'Loading the Standard Complaint master…',
  });

  // The wording ITSELF, one field earlier: the alarm number in this product's
  // spelling, and how the fault has been written here before (0107).
  const reportedHelp: FieldDef['below'] = ({ values, set }) => (
    <ComplaintTextHelp
      reported={String(values.complaintReported ?? '')}
      product={String(values.productName ?? '')}
      onPick={(v) => set('complaintReported', v)}
    />
  );

  // THE PARTY FIELD. A picker over the parties that own a machine — and where a
  // new customer is legitimate, the maintained master is appended behind them
  // and free text is allowed on top.
  //
  // The order matters: parties WITH machines come first, because on every call
  // but an installation they are the only ones that can be the answer. The
  // master's extras follow rather than being mixed in, so a name that will not
  // cascade is never the first thing under the cursor.

  // THE CUSTOMER IS SEARCHED ON THE SERVER, not downloaded (2026-09-10: "party
  // name and Product - both are taking about 8 & 4 sec"). Thousands of names is
  // three paged requests and a few hundred KB before the field works at all,
  // and it gets worse as the register grows. One small request per search
  // instead, debounced — and it costs the same at fifty thousand customers.
  //
  // OWNERS ONLY on a field call or a PM, because the machines are looked up BY
  // this name. An INSTALLATION searches both and puts the owners first, since
  // it reaches a customer who may have no machine yet.
  const partyField = (f: FieldDef): FieldDef => ({
    ...f,
    type: 'select' as const,
    // The CURRENT value only — enough to keep a saved record's customer
    // selectable while a search is in flight. The rest comes from the server.
    options: [],
    onSearch: opts.newPartyAllowed ? sbSearchPartiesForInstall : sbSearchPartiesForCall,
    // Shown but unpickable where the customer owns no machine — see the note on
    // sbSearchPartiesForCall. The reason on the row beats a bare "no match".
    isDisabled: opts.newPartyAllowed ? undefined : partyOwnsNoMachine,
    labelForOption: opts.newPartyAllowed ? undefined : (v: string) => (partyOwnsNoMachine(v)
      ? `${v} — no machine on record` : v),
    allowFreeText: !!opts.newPartyAllowed,
    datalist: undefined,
    help: opts.newPartyAllowed
      ? 'Type to search. Customers who already own a machine come first; a new customer can be typed in.'
      : 'Type to search customers who own a machine. The products and serials below are looked up by this name.',
  });

  const inject = (fs: FieldDef[]) =>
    fs.map((f) =>
      f.name === 'partyName' ? partyField(f)
        : f.name === 'standardComplaint' ? complaintField(f)
          : f.name === 'complaintReported' ? { ...f, below: reportedHelp }
            : f.name === 'allocatedTo' ? { ...f, options: engineerNames }
              // No desk resolved (nobody pinned one and there is not exactly
              // one hotline profile) means the database will file the call to
              // whoever registers it — so say that, rather than showing a name
              // that would be wrong.
              : f.name === 'registeredBy' ? { ...f, defaultValue: deskName || (meName ? `${meName} — no Hotline desk is set` : '') }
                : f.name === 'actuallyRegisteredBy' ? { ...f, defaultValue: meName }
                  : f);

  return { inject, offered };
}
