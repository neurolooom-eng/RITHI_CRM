// ===========================================================================
// MODULE GUIDE — How RITHI Functions → All modules (the user, 2026-10-02:
// "Update how RITHI works for all modules"). One entry per menu screen, in the order of `NAV`
// (src/components/layout/Layout.tsx), grouped by its group titles.
//
// Sources, in order of authority: the screen’s code and the src/lib/supabase.ts
// functions it calls; docs/HOW_TO_USE.md; docs/CAPABILITY_INVENTORY.md.
// `records` lists the tables / views / database functions the screen reads or
// writes (taken from the code). Everything else is written for service staff.
// ===========================================================================

export interface ModuleGuideEntry {
  route: string;          // the NAV item's `to`, exactly
  purpose: string;        // 1-2 sentences: what the screen is for, in the user’s words
  does: string[];         // 2-5 short bullets: the main things a person does there
  records: string[];      // table / view names it reads or writes (from the code)
  rules: string[];        // 1-3 short bullets: what it refuses / the rule that is easy to get wrong
}

export const MODULE_GUIDE: ModuleGuideEntry[] = [
  // ─────────────────────────────── Overview ───────────────────────────────
  {
    route: '/',
    purpose: 'What is open, what is overdue and what needs you: live counts, charts and SLA flags for the Field and Installation calls your role can see.',
    does: [
      'See call counts, calls this month, SLA breached and due-soon counts',
      'Read the “needs attention” list — breached first, then due — and click a call to open it in its register',
      'See charts: calls over six months, cover mix, top products, calls by engineer',
      'See how many call requests are still waiting for a UCN',
    ],
    records: ['calls', 'call_requests', 'sla_rules'],
    rules: [
      'You see what your role allows — two people can see different totals on the same day',
      'PM calls are not counted on this page; only Field and Installation calls',
    ],
  },
  {
    route: '/workload',
    purpose: 'Everything waiting on you, across the registers you can open. Click a card and you get the list behind it.',
    does: [
      'See queue counts for Spare Requests, RM Approval, Pending Dispatch, Hand Stock, Material Returns, Stock Transfer and the Daily Complaint Review',
      'Click a card to open that register already filtered to the same slice',
      'See installation requests waiting on Commercial, split into KYC verified, waiting on KYC, and customer not on the Party Master',
    ],
    records: ['spare_request_lines', 'spare_pending_rm', 'spare_pending_dispatch', 'handstock_balance', 'material_returns', 'stock_transfer_lines', 'field_call_review_summary', 'call_requests', 'parties'],
    rules: [
      'A section appears only for a register you can already open — this screen grants nothing new',
      'A card with nothing behind it (such as the longest wait) is a plain figure and opens nothing',
      'A count ending in + is a lower bound',
    ],
  },
  {
    route: '/lookup',
    purpose: 'Find a machine or a customer and see everything about it: from a product or serial to the customer holding it, or from a customer to every machine they hold.',
    does: [
      'Search by product and serial, or by party name',
      'Open a customer’s card and see every machine they hold, with cover and engineer',
      'Press ＋ Field call on a machine to open the Field Call form already filled in',
      'Press Download again to refresh the copy kept on this device',
    ],
    records: ['products', 'product_database', 'product_register_names', 'parties'],
    rules: [
      'It searches the copy of the machine register and Party Master kept on your device, refreshed every six hours — a machine added in the last few hours needs Download again',
      'Clear Cache and Update does not re-download that copy',
      'Only customers who own a machine are offered in the party search',
    ],
  },
  {
    route: '/machine-history',
    purpose: 'One machine, its whole life: where it is now, and everything any register holds about it.',
    does: [
      'Pick the product first, then the serial',
      'See where it is now — owner, status, engineer, warranty and contract',
      'Read the timeline of calls, visits, spares fitted, Field Failure Reports, feedback, sale, contracts, transfers, additional entries and workshop jobs',
      'Filter the timeline by register, or export it',
    ],
    records: ['products', 'machine_cover', 'calls', 'reports', 'spare_consumption', 'field_failure_reports', 'feedback', 'warranty_sale_details', 'contract_details', 'ownership_transfers', 'product_additional_entries', 'indoor_jobs', 'audit_log'],
    rules: [
      'A serial on its own is not a machine — the same serial belongs to several models, so product comes first',
      'A machine not on the Product Database still has a history, and the screen says so',
      'Every lookup is recorded in the audit log',
    ],
  },
  {
    route: '/part-search',
    purpose: 'Look a part up: every active part with its Part Code, Description, Spare / Consumable and the products it fits.',
    does: [
      'Search by code, description or product — all the words, in any order',
      'Narrow with the type-to-search filter on each column; each offers only what the other filters leave on screen',
      'See “Common (all products)” for a part that fits every product',
    ],
    records: ['parts'],
    rules: [
      'Read only for everybody, administrators included: no edit, no buttons, no download — parts are changed on the Part Master',
      'Only active parts are listed; a common part stays listed whatever product you pick',
    ],
  },

  // ───────────────────────── Quality & Analytics ──────────────────────────
  {
    route: '/daily-review',
    purpose: 'The Daily Complaint Review Register (R/SER/35), where every call is reviewed: Review 1 is the vigilance answer taken at registration, Review 2 asks what the failure was, Review 3 classifies it.',
    does: [
      'Work the register, the Review Desk and the Review 2 / Review 3 worklists',
      'Answer Review 2 (Risk to Patient, Warranty Failure 1 yr, Frequent Failure) and Review 3 (Complaint Grouping, Root Cause Key Word)',
      'Answer Review 2 = NO in bulk for eligible calls, or switch Auto review on',
      'Open the call’s visits, spares and Machine History, and Raise FFR from the review',
      'Export the register as a CSV',
    ],
    records: ['call_reviews', 'field_call_review', 'field_call_review_summary', 'reports', 'spare_consumption', 'field_failure_reports', 'masters', 'product_master', 'app_settings', 'rpc:frequent_failure', 'rpc:bulk_set_review2', 'rpc:auto_answer_review2', 'rpc:set_auto_review', 'audit_log'],
    rules: [
      'Answering YES to any Review 2 question raises a Field Failure Report by itself; a later NO leaves it standing as withdrawn',
      'Bulk answers and Auto review never answer a first-year failure or a call with no known age — those are reviewed one at a time',
      '“Change product?” counts the failure against the accessory that actually failed; the call itself is not changed',
    ],
  },
  {
    route: '/failure-report',
    purpose: 'Failures that go back to manufacturing, on the controlled form R-SER-03, numbered FFR - 001/26 and restarting each year.',
    does: [
      'Read reports on the Desk (list, report, the call as it stands) or in the Table',
      'Raise an FFR by hand, or complete one raised from the Daily Complaint Review Register',
      'Fill in CAPA responsibility, number and status, and do the weekly review',
      'Print the R-SER-03 page or download a Word copy',
      'Use Insights: trend, Pareto with drill-down, and cross-filtered charts',
    ],
    records: ['field_failure_reports', 'field_failure_register', 'ffr_history', 'user_signatures', 'rpc:ffr_call_context', 'audit_log'],
    rules: [
      'The FFR number is issued by the database on save and is never edited',
      'A report is never deleted; it is cancelled or shows as withdrawn',
      'Your saved signature prints only where the form names you as the raiser',
    ],
  },
  {
    route: '/product-failure',
    purpose: 'What fails, and why, across the whole review register — the question the register as a worklist cannot answer.',
    does: [
      'Read Pareto, share and trend charts by product, cover, root cause, complaint grouping, standard complaint and more',
      'Click any bar to narrow every chart; click again to let go',
      'Download any chart with the reviews behind it',
      'Build your own chart with ＋ New chart and keep it, or share it',
    ],
    records: ['field_call_review', 'saved_charts', 'audit_log'],
    rules: [
      'It opens on this year; a failure’s year is its complaint date, not when it was reviewed',
      'A failure moved to an accessory in Review 2 is counted against that accessory',
      'Sharing a chart shares the question, never the data — each reader sees only what their role may see; sharing needs Manage configuration',
    ],
  },
  {
    route: '/kpi',
    purpose: 'Failure rate per 100 machines in the field, how products fail, and spare use by cover, region and product.',
    does: [
      'See cards: machines in the field, calls in 12 months, failure rate, spares consumed, parts per call',
      'Narrow every panel with the Product and Region chips',
      'Read spare use by cover, region and product, and the region × cover table',
      'Click a complaint in “How products fail” to open the Field Call Register searched for it',
    ],
    records: ['failure_rate_by_product', 'failure_modes_by_product', 'spare_usage_rollup'],
    rules: [
      'Cover is always one of WGP / OGP / CMC / AMC; an unrecognised value counts in neither tile',
      'If your role does not see every call, your figures are your share against the whole fleet, and the screen says so',
    ],
  },
  {
    route: '/spare-insights',
    purpose: 'What spares were consumed in a date window, under what cover, into which products, and whether spare or consumable.',
    does: [
      'Pick the From / To window, or press This year',
      'See spares consumed, distinct parts, calls involved and the share unclassified',
      'Read consumable vs spare, consumption by cover, top parts, top products and month by month',
    ],
    records: ['rpc:spare_insights', 'spare_consumption'],
    rules: [
      'Both ends of the window count; voided lines count as nothing',
      'A part with no category shows as Unclassified rather than guessed — fix it on the Part Master',
    ],
  },
  {
    route: '/objective',
    purpose: 'The year’s quality and business objectives, with targets, owners and the month-by-month actual — typed, or worked out from the registers with evidence behind each figure.',
    does: [
      'Read the year’s table, each month coloured against its target',
      'Type a month’s figure, or press Re-Calculate for the computed rows',
      'Set the per-month cut-off dates (locked by an administrator when the lock is on)',
      'Download the evidence workbook behind a computed month',
    ],
    records: ['quality_objectives', 'objective_cutoffs', 'rpc:recalc_quality_objectives', 'rpc:objective_evidence', 'rpc:set_objective_cutoff', 'rpc:set_objective_cutoff_lock', 'audit_log'],
    rules: [
      'Re-Calculate is explicit, never on opening the page; it touches only computed rows, up to this month',
      'Blank means not measured, not zero; a quarterly objective reads NA outside its quarter’s last month',
      'Field failures registered counts FFR reports, not rows, and a month with none reads 0',
    ],
  },

  // ─────────────────────────────── Documents ──────────────────────────────
  {
    route: '/qms',
    purpose: 'The controlled QMS shelf: documents with their number, revision and effective date.',
    does: [
      'Search and open a document in Drive',
      'Add a document by uploading the file or pasting a link, and choose who must be trained on it',
      'Edit, retire or restore a document',
      'Load the whole Master List at once through Bulk Uploads',
    ],
    records: ['documents', 'training_assignments', 'user_directory'],
    rules: [
      'A QMS document needs its number, a title and a file or link',
      'Adding one here assigns training to everyone matching the audience; a bulk load assigns none',
      'A retired document stays on the shelf as the record',
    ],
  },
  {
    route: '/training',
    purpose: 'Who must be trained on what, and where each person stands.',
    does: [
      'Assign training on a QMS document or a topic, with a due date and the people',
      'Record a session: date, trainer, method, attendance sheet, and each attendee’s Attended, Pass / Fail, score and remarks',
      'Click a name for that person’s full training record',
      'Cancel a wrong assignment with a reason',
    ],
    records: ['training_assignments', 'training_status', 'training_sessions', 'training_attendance', 'documents', 'user_directory'],
    rules: [
      'Complete means attended a session or confirmed Read & understood; a Fail keeps it open as Failed - retrain',
      'Nothing is deleted; past the due date it reads Overdue',
      'Changing anything needs Manage training',
    ],
  },

  // ───────────────────────── Contracts & Warranty ─────────────────────────
  {
    route: '/warranties',
    purpose: 'Sale entries (SA) and the machines sold under each, with their warranty.',
    does: [
      'Key a new sale: pick the customer from the Party Master and the address, tax and engineer fill in',
      'Give the warranty start and the period in months; end date, years and PM visits follow',
      'Add the machines (product from active Product Master lines, serial typed)',
      'Raise the installation calls for the machines, or one machine at a time from Register',
      'Filter the Register to machines still waiting for an installation call (INSTALL CALL PENDING); click a line to open its sale',
      'Click an entry to open it in a pop-up: sale details on the left, its products on the right, every button in the bar at the top',
      'Use ↺ Force update child records to make every machine follow the entry again',
      'Use ⇢ Convert to Contract to raise a contract from this sale: the customer and machines carry over, you give the MC Number, type, period, PM visits and billing',
    ],
    records: ['sale_entries', 'sale_items', 'warranty_sale_details', 'parties', 'product_master', 'calls', 'rpc:link_install_call', 'contract_entries', 'contract_items'],
    rules: [
      'Save entry is greyed out until something on the entry has changed',
      'Converting needs the right to create contracts; it warns if the sale is already on a contract',
      'Converting never offers a machine now with a different customer: it is listed apart as "Product serial number was transferred to a different customer"',
      'Save the entry before raising installation calls; a line needs both a Product and a Serial to get one',
      'A sale to a DEALER gets no installation call — it is raised from the Ownership Transfer when the dealer sells the machine; Sold Through lists dealers only',
      'Changing the customer replaces all the filled-in details, blanks included',
      'Service Engineer is picked from the User Master\'s active people; a name that is not one is flagged in red',
      'Required on every sale: Party Name, Invoice No, Invoice Date, Warranty Start Date, Warranty Period (Months) and PM Visits',
      'Party Name cannot be changed once the sale is saved',
      'Party details changed on the sale (Type, Profile, Country, State, City, Address, Pincode, phones, PAN, GST, Service Engineer) are written back to the Party Master on Save entry; this needs the right to edit parties, and without it the sale saves and says the master was not updated',
      'A customer not on the Party Master is added to it when the sale is saved; Party Type, Profile, Country, State, City, Address, Pincode, GST and Service Engineer are then required. A role that may not add parties saves the sale without adding it',
      'A retired product line takes no new sale',
    ],
  },
  {
    route: '/contracts',
    purpose: 'Contract entries (MC) and the machines they cover.',
    does: [
      'Browse Entries or Register (one row per machine), with Active / About to expire / Inactive tiles',
      'Click an entry to open it in a pop-up: contract details on the left, its products on the right, every button in the bar at the top',
      'Create or edit a contract and its machines; a machine follows its entry unless you type over it',
      'Pick the Party from the Product Database by typing part of the name; the Start Date opens on today',
      'Give the Period in months; the years and the End Date fill in, and PM Visits (Total) is suggested',
      'Enter a Rate per machine; 18% tax and the total fill in',
      'Renew this contract: the next MC starts the day after the old one ends, with new rates set here',
    ],
    records: ['contract_entries', 'contract_items', 'contract_details', 'products', 'calls'],
    rules: [
      'About to expire means the last 30 days; a machine with no end date shows Not covered, which is not Inactive',
      'Rates never carry over on renewal — you set them, with last time’s rate shown beside each',
      'Period (Months), PM Visits (Total), Payment Schedule and Bill Generate At must be filled before the entry saves',
      'The Party Name is picked from the Party Master (this device\'s copy first); a name cannot be typed in',
      '+ Add machine lists every machine the Product Database shows with the customer: tick them, give each a Rate and Tax, and Add. Total After Tax is Rate + Tax; a machine already on the contract cannot be added twice; one not listed is added by hand',
      'The End Date and the Period (Years) are worked out and cannot be typed, on the form and on renewal',
      'The offered number is not reserved: two people starting at once get the same one and the second is refused',
    ],
  },
  {
    route: '/ownership-transfer',
    purpose: 'One row per machine changing hands, plus warranty and contract details recovered for machines whose sale paperwork was lost.',
    does: [
      'Record a transfer: pick the machine from the Product Database (serial, model, current party), see its current details, sale and warranty; pick the To party from the Party Master; date, reference, reason, document',
      'Raise the installation call for the customer a dealer sold the machine to: + Installation call on the transfer (OT-PRODUCT-SERIAL, dated the transfer date)',
      'Add entry details for a machine with no sale record',
      'Search either tab',
    ],
    records: ['ownership_transfers', 'product_additional_entries', 'products'],
    rules: [
      'On the screen, From is the machine\'s current party on the Product Database; on a file load, a blank From fills from whoever holds the machine now',
      'To party must be on the Party Master',
      'The machine follows the latest transfer; a back-dated one does not undo a later one',
      'There is no edit or delete of a transfer on this screen',
      'Sold Through is the From party when the Party Master types it DEALER — filled in by the system, and shown in the Product Database',
    ],
  },

  // ───────────────────────────── Knowledge Base ───────────────────────────
  {
    route: '/knowledge-base/how-to',
    purpose: 'The built-in step-by-step guide to RITHI CRM, plus the team’s How-To articles.',
    does: [
      'Jump to a task and read who does it and the steps',
      'Press Open <screen> to go straight to a screen you may open',
      'Read the team’s How-To articles',
    ],
    records: ['help_screenshots', 'kb_articles'],
    rules: [
      'Open to everyone signed in; only an administrator can add or replace the screenshots',
    ],
  },
  {
    route: '/knowledge-base/how-it-works',
    purpose: 'Why the form already knows things: diagrams of how a call works, how a spare moves, how hand stock moves, and the spare module’s schema.',
    does: [
      'Pick a document with the chips; your choice is remembered on this device',
      'Open a document on its own in a new tab',
    ],
    records: [], // reads the HTML documents in public/docs/, not the database
    rules: [
      'Limited to the roles given it on Roles & Permissions (Admin, NSM, Zoho, Technical Support to begin with)',
    ],
  },
  {
    route: '/knowledge-base',
    purpose: 'Field Solutions: team-written articles about field problems and their fixes.',
    does: [
      'Search articles by title, category, product, tags, text or author',
      'Add an article with a category, products, tags, rich text and attachment links',
      'Edit or delete your own article',
    ],
    records: ['kb_articles', 'product_master'],
    rules: [
      'Anyone signed in can add; only the author or an administrator can edit or delete, and a delete cannot be undone',
      'An article filed as How-To is listed on How to Use',
    ],
  },
  {
    route: '/service-manuals',
    purpose: 'Service manuals, indexed by product, so a call shows the right ones.',
    does: [
      'Search and open a manual in Drive',
      'Add a manual by uploading the file or pasting a link, and name its product',
      'Edit, retire or restore a manual',
    ],
    records: ['documents'],
    rules: [
      'A manual with no product applies to every product',
      'Adding or changing needs the Service Manuals permission; a retired manual stays as the record',
    ],
  },
  {
    route: '/service-manuals/notes',
    purpose: 'Technical bulletins and service notes, by product, kept the same way as the manuals and offered on calls.',
    does: [
      'Search and open a note in Drive',
      'Add a note and tick every product it covers (none ticked means every product)',
      'Load many at once through Bulk Uploads → Technical / Service Notes, matched on the Drive link',
      'See each active note under a call’s 📄 Supporting documents for its product',
    ],
    records: ['documents'],
    rules: [
      'Whoever can open Service Manuals can open these; adding needs the same permission',
      'For a note loaded from the Drive listing, Added / Added By / Updated are Drive’s own; RITHI’s entry is under Record details',
      'Re-loading the list corrects notes rather than adding them twice; a retired note is not offered on calls',
    ],
  },

  // ───────────────────────────── Service Calls ────────────────────────────
  {
    route: '/request-registration',
    purpose: 'Raise a request for 1 to 5 calls, and see every call registration request and what became of it.',
    does: [
      'Search the machine by any part of its serial; the customer and site follow',
      'Pick the Standard Complaint from that product’s list and type the reported problem',
      'Answer Call Attended? and give the attended or planned date',
      'For an installation, pick or type the customer and upload the Installation Report and KYC',
      'Correct a request while it is still Pending',
    ],
    records: ['call_requests', 'products', 'product_database', 'parties', 'masters', 'rpc:next_call_reqid', 'audit_log'],
    rules: [
      'The machine names the customer: search the serial first; an installation is the exception',
      'A serial that names no customer, a missing reported problem, or the same machine twice is refused with the reason',
      'Only a Pending request can be corrected',
    ],
  },
  {
    route: '/pending-registrations',
    purpose: 'The Hotline queue of requests with no UCN. Registering one issues the UCN and files the call.',
    does: [
      'See every pending request and whether its machine already has an open call',
      'Filter by Call Type with the chips at the top, each with its count',
      'Map a request to an existing call by its UCN',
      'Create the new call from the request, already filled in',
      'Cancel a request with a reason',
    ],
    records: ['call_requests', 'calls', 'pending_calls', 'products'],
    rules: [
      'The call is filed to the Hotline desk, but who actually typed it in is recorded separately — the two differing is a finding, not an error',
      'A cancel needs a typed reason (free text, not a master list), with an optional note',
      'A role without the right can read the queue but cannot act on it',
    ],
  },
  {
    route: '/field-calls',
    purpose: 'The register of field (breakdown) calls: register, view, edit, allot, visit, re-open, cancel and restore.',
    does: [
      'Register a new field call from the Product Database (party, product, serial)',
      'Open a call and file a visit, request spares, or record a missed spare (Reco)',
      'Allot ticked calls to an engineer in your team',
      'Update Party Details / Update Product Details on one call or many',
      'Re-open, close again, cancel or restore a call',
    ],
    records: ['calls', 'reports', 'feedback', 'spare_consumption', 'spare_requests', 'parties', 'products', 'complaint_suggestions', 'rpc:cancel_call', 'rpc:restore_call', 'rpc:reopen_call', 'rpc:close_reopened_call', 'rpc:refresh_calls_party', 'rpc:refresh_calls_product', 'audit_log'],
    rules: [
      'A Solved call is read-only; a cancel is not a delete and needs a reason',
      'What you may change is four separate rights — complaint, customer and machine, vigilance answers, contact details',
      'Update Party / Product Details are hidden and refused while Audit Mode is ON',
    ],
  },
  {
    route: '/installations',
    purpose: 'The same register for installation calls — new machines going in.',
    does: [
      'Register a new installation call (customer may be typed as new)',
      'File the installation visit, choosing where the warranty starts: Installation Call Solved Date or Invoice Date',
      'See, under that choice, the machine\'s warranty now and after this report',
      'Everything else as on the Field Call Register',
    ],
    records: ['calls', 'reports', 'feedback', 'spare_consumption', 'parties', 'products'],
    rules: [
      'New installation calls are for the Commercial function (and others only by grant)',
      'Installation calls have their own permission ticks, separate from Field calls',
      'Installation Call Solved Date starts that product + serial\'s warranty on the day the call is solved and ends it one warranty period later; each choice is kept in the installation warranty record',
    ],
  },
  {
    route: '/pm-calls',
    purpose: 'The same register for preventive (planned) maintenance calls.',
    does: [
      'Register a single PM call',
      'File PM visits and the rest of the Field Call Register actions',
    ],
    records: ['calls', 'reports', 'feedback', 'spare_consumption'],
    rules: [
      'A PM call raised by PM Bulk Upload is dated the 1st of the chosen month',
      'PM calls have their own permission ticks, separate from Field calls',
    ],
  },
  {
    route: '/pending-calls',
    purpose: 'Everything still open, across Field, Installation and PM.',
    does: [
      'Filter by status tile, call type and engineer, or search',
      'Tick calls and re-allot them to an engineer in your team',
      'Click a call to open it in its own register',
      'Export to CSV',
    ],
    records: ['pending_calls', 'calls'],
    rules: [
      'An empty list means everything is closed only for a role that sees every call; otherwise it means nothing you can see',
      'Re-allotting needs the allot right',
    ],
  },
  {
    route: '/reports',
    purpose: 'The visit history: one row per visit, not per call.',
    does: [
      'Browse visits newest first and filter by UCN, call number, engineer or status',
      'Open a visit to read every field and its service report',
      'Turn on any field the engineer filled as a column',
      'Export to Excel or CSV',
    ],
    records: ['reports'],
    rules: [
      'Two dates on purpose: Visit date is when the engineer was there; entry date is when the register was told',
      'A call’s status comes from its latest visit entry',
    ],
  },
  {
    route: '/call-review',
    purpose: 'A second look at the report on a solved call.',
    does: [
      'Work the Awaiting review list on a three-pane desk',
      'Mark the report reviewed, with remarks',
      'Book a spare the engineer did not record (a Reconciliation line, visibly a correction)',
      'Re-open the call with a reason',
    ],
    records: ['calls', 'reports', 'spare_consumption', 'call_report_reviews', 'handstock_balance', 'rpc:reopen_call', 'audit_log'],
    rules: [
      'A missed spare can only come from the attending engineer’s hand stock, up to their balance, with a reason',
      'A solved call with no visit is itself the finding',
    ],
  },
  {
    route: '/feedback',
    purpose: 'What customers told us, kept with the calls — one column per question.',
    does: [
      'Browse and search the feedback',
      'Tell Uploaded rows from Entered here, with a count on each',
      'Export to CSV',
    ],
    records: ['feedback'],
    rules: [
      'Date is the feedback’s own date; Loaded on is when the row arrived — a different fact',
      'Feedback is taken on the visit report of a solved call, one per call',
    ],
  },

  // ──────────────────────────────── Spares ────────────────────────────────
  {
    route: '/spare-requests',
    purpose: 'Every spare line, one row per part: raised by the engineer and taken through RM, Commercial and NSM approval to receipt.',
    does: [
      'Raise a request — Call Based (against a call) or HandStock (with a reason)',
      'Approve, reject or drop lines at your stage, one at a time or in bulk',
      'Acknowledge receipt of what Stores sent',
      'Press ↻ Update from call to bring an older request in line with its call',
      'Change the engineer on an order before anything is dispatched',
    ],
    records: ['spare_requests', 'spare_request_lines', 'spare_request_engineer_log', 'rpc:decide_spare_lines', 'rpc:receive_spare_shipments', 'rpc:refresh_spare_requests_from_call', 'rpc:reassign_spare_request', 'audit_log'],
    rules: [
      'Only Approved, Auto-Approved or “Cleared for Stores Processing” move a spare on; anything else waits at that approver',
      'Reject and drop need a reason; approvals are per line',
      'A part must come from the Part Master; the list offers the call product’s parts, its accessories and common parts unless you tick Show all parts',
    ],
  },
  {
    route: '/spare-rm-approval',
    purpose: 'The Reporting Manager’s queue of spares waiting for first approval, with the complaint, machine, serial and cover beside each.',
    does: [
      'Read each line against the fault it is for',
      'Tick your lines and Approve or Reject them together',
      'Group by engineer, order or cover, and export',
    ],
    records: ['spare_pending_rm', 'spare_request_lines', 'rpc:decide_spare_lines', 'audit_log'],
    rules: [
      'You cannot approve your own request, or one outside your team — those rows show “Not yours” and cannot be ticked',
      'Reject and drop need a reason',
    ],
  },
  {
    route: '/spare-dispatch',
    purpose: 'Stores’ queue of fully approved spares, grouped by engineer: issue the parts and raise the Delivery Challan.',
    does: [
      'Tick spares for one engineer and book them out in one stock out',
      'Send fewer units than outstanding, or mark a line Refurbished',
      'Set the DC date, courier and remarks, then go straight to the Delivery Challan',
      'Drop a spare that will not be sent, with a reason',
    ],
    records: ['spare_pending_dispatch', 'spare_request_lines', 'spare_dispatches', 'spare_stock_out_lines', 'rpc:dispatch_spare_lines', 'audit_log'],
    rules: [
      'A stock out goes to one engineer — a selection spanning two is refused',
      'You cannot send more than is still outstanding; the dispatcher’s name is stamped from your sign-in',
      'The parts count as the engineer’s hand stock the moment they are booked out',
    ],
  },
  {
    route: '/stock-out',
    purpose: 'A flat list of every spare Stores has issued — its DC, its call and how long it took — a different question from the dispatch queue.',
    does: [
      'Search by stock out, DC, engineer, part, order, UCN or party',
      'Print the Delivery Challan or open the Declaration for a row',
      'Export to CSV',
    ],
    records: ['spare_stock_out_lines'],
    rules: [
      'Read only; it is granted separately from Pending Dispatch',
    ],
  },
  {
    route: '/spare-consumption',
    purpose: 'Spares booked against the calls they were fitted to; office roles also add reconciliation lines and correct quantities here.',
    does: [
      'Browse and search consumption lines; click a line to read every field it carries',
      'Add consumption (reconciliation) for a part fitted but never reported',
      'Adjust a line’s quantity with a reason; setting it to 0 voids it and returns the stock',
      'Export to CSV',
    ],
    records: ['spare_consumption', 'engineer_stock', 'calls'],
    rules: [
      'A spare needs a visit report on its call — except a reconciliation line',
      'Consumption is capped at the engineer’s hand stock balance',
      'A line is never deleted; a wrong one is voided to 0 and keeps its original quantity and reason',
    ],
  },
  {
    route: '/handstock',
    purpose: 'What each engineer holds, per part — worked out, never stored: issued − consumed ± transfers − returns.',
    does: [
      'See each engineer’s stock level and the terms that make it up',
      'Filter In hand, Short, Settled; search the whole register',
      'Open a line for its movement trail, or read the Movements ledger',
      '± Adjust stock with a reason and reference (reconciliation permission)',
    ],
    records: ['handstock_balance', 'rpc:handstock_balance_all', 'handstock_movements', 'handstock_adjustments'],
    rules: [
      'A negative (Short) level is a finding: more was consumed than this system knows was issued',
      'If the balance is wrong the Spare Coordinator corrects the stock; the engineer does not book around it',
      'An adjustment is never edited or deleted, and a removal cannot take anyone below zero',
    ],
  },
  {
    route: '/mrn',
    purpose: 'Material Return Notes: parts an engineer sends back to Stores; the return comes off their hand stock.',
    does: [
      'Record a new MRN with the number from the paper slip',
      'Pick parts the engineer holds and give good and defective quantities',
      'Open an MRN to see its lines; export to CSV',
      'Print an MRN as the Material Return Note R/SER/STR/002',
    ],
    records: ['material_returns', 'engineer_stock', 'handstock_balance', 'user_directory', 'audit_log'],
    rules: [
      'Only parts the engineer holds are offered, and good + defective together cannot exceed what they hold',
      'The MRN number is typed, not generated',
      'The printed MRN shows what the return holds and nothing more: Store Dept. Use, Authorized By and Received By are left for Stores to fill by hand',
    ],
  },
  {
    route: '/stock-transfer',
    purpose: 'Hand stock passed from one engineer to another.',
    does: [
      'Record a transfer: from, to, date, parts and quantities, a common remark and, if wanted, a reason for each part',
      'Search past transfers; export to CSV',
      'Print a transfer as the Material Transfer Note (MTN) R/SER/STR/003',
    ],
    records: ['stock_transfers', 'stock_transfer_lines', 'engineer_stock', 'user_directory', 'audit_log'],
    rules: [
      'A transfer to the same person is refused',
      'Only parts the From engineer holds are offered, up to what they hold',
      'On the MTN a part prints its own reason where it has one, and the common remark otherwise',
      'The MTN leaves Received By blank: a transfer records no receipt',
    ],
  },

  // ──────────────────────────── Indoor Service ────────────────────────────
  {
    route: '/indoor',
    purpose: 'Work on a unit in the workshop, from receipt to dispatch: repair, rework, salvage, pre-delivery inspection, demo and other.',
    does: [
      'Receive a unit through the intake: from its call (product + serial lists the open calls, or type the UCN — the job fills from the call) or as a DEMO / new device, listing the accessories received with their quantities',
      'Follow each job through its stages — Intake, Cleaning, Repair, Report, DC — on a stepper that shows only the current and completed stages',
      'Upload the Indoor Service Report with its number once the unit is cleaned — from the job or the register — and, for a unit with a call, fill its Visit Entry as a draft in the same form',
      'Request a spare from the job through the Spare Request form, the call filled in',
      'Record whose property it is and what activity is being done',
      'Record cleaning and disinfection, findings, work done and parts harvested',
      'Record the quality check, then dispatch',
      'Fill the R/SER/07 register columns — Field Service Report No, engineer, place, problem reported, the cover (read from the machine), Indoor Service Report No, DC date, remarks',
      'Record Pre-Delivery Testing (R/SER/QC/007) on a DEMO unit of an imported product, sign it, and print it',
      'Verify a completed register entry',
      'View the register as R/SER/07 (Customer – Devices / Demo), download it to Excel and print it',
      'Tick Ready units for one consignee and create an Indoor DC (IDC-YYMM-NNNN) for them, naming who authorises it; list and re-print every Indoor DC',
      'Approve or reject an Indoor DC that names you — approving files each unit\'s drafted visit against its call',
      'Who may authorise a DC comes from the User Master: your Reporting Manager, your Regional Manager, and the Regional Manager\'s own manager as NSM — never yourself; they approve whatever their role',
      'Open a job as a window; from its DC page create the Indoor DC in a pane beside the job, the divider dragged to taste',
      'Pick the Visiting Service Engineer for the drafted visit from the active people on the User Master (you by default)',
      'Arrange the R/SER/07 register\'s columns — order, width, wrap, which are shown — as on every register',
      'Delete a job received in error, permanently, with a reason (needs the Delete an Indoor Service job right)',
    ],
    records: ['indoor_jobs', 'indoor_job_list', 'indoor_job_parts', 'indoor_job_accessories', 'indoor_pdt', 'product_master', 'indoor_dcs', 'indoor_dc_lines', 'indoor_dc_list', 'parties', 'calls', 'pending_calls', 'reports', 'spare_consumption', 'spare_requests', 'rpc:indoor_dc_authorisers', 'rpc:create_indoor_dc', 'rpc:approve_indoor_dc', 'rpc:reject_indoor_dc', 'rpc:delete_indoor_job', 'user_directory', 'audit_log'],
    rules: [
      'A harvested part cannot go back into stock until decontamination is recorded',
      'A job cannot be Dispatched or Closed without a quality check',
      'A job does not need a call — a demo unit has none',
      'A DEMO unit of an imported product is not Dispatched or Closed until its Pre-Delivery Testing is complete, signed, and every check reads OK; unknown imported-ness does not demand it',
      'Verifying an entry needs its own right, and only once the unit is Dispatched, Closed or Condemned; who and when are recorded by the system',
      'The Excel register and the printed register need the export right',
      'An Indoor DC needs the dispatch right, carries units for one consignee only, and is refused for a unit that is not Ready, already on a DC, or that the dispatch rules would not let leave',
      'The DC number is issued by the system; issuing it writes the DC No. and date on each unit and does not change their status',
      'An Indoor DC is never deleted',
      'The Indoor Service Report is refused until the unit is cleaned, and without its report number; the uploader is recorded by the system',
      'An Indoor DC needs every unit\'s report uploaded, is dated the day it is entered, and names its Authorised By — the issuer\'s Reporting Manager, Regional Manager or an NSM',
      'Only the Authorised By or an administrator approves or rejects an Indoor DC; a unit on a DC pending approval is not dispatched',
      'Approval is refused until every unit\'s visit is filed — Unsolved, pending Return to Field, work details Yes; a unit with no call files none',
      'A rejected DC is kept, with its reason, and its units are released for a new DC',
      'Requesting a spare from a job does not change the call\'s status',
      'The visit is filed under the engineer picked on the Repair page, and its spares come from that engineer\'s hand stock',
      'Deleting a job needs its own right (no role holds it until an administrator ticks it), a reason and the job number typed; it is refused once the job has been on any Indoor DC or its visit is filed, and it is recorded with who, when and why',
    ],
  },
  {
    route: '/indoor/recycling',
    purpose: 'Recycle defective spares on a track of their own — registration, an MRS with no approval, stock out with cost into a separate recycling hand stock, consumption, job done and the cost of each recycling. Hidden while Audit Mode is on.',
    does: [
      'Register a defective spare for recycling (RCY/YY/NNNN): the part from the Part Master, quantity, received on, its Source (Service Return or Defective Spare) and an optional call reference kept as text — a quantity of 3 becomes 3 requests, one per spare; requests can be ticked and deleted with Delete a recycling request',
      'Import spares from MRN: search any MRN, pick a line, and import its good and defective quantity as requests with the Source Defective Spare (the MRN No kept on each); a line can be imported again',
      'Start Work on a request with the date and time — the SLA (working days, set on the SLA page) runs from then, and the list shows the due time and On track / Due today / Breached / Met',
      'Raise an MRS (RMRS/YY/NNNN) for the spares needed — no approval — optionally against an open recycling request',
      'Stores books an MRS line out with its unit cost, in one go or in parts; the quantity goes to the raiser\'s recycling hand stock',
      'See the recycling hand stock per person and part: issued, consumed, balance and average unit cost',
      'On a request: record the job done, consume spares from your recycling hand stock, add other costs (labour, courier, vendor, other)',
      'Close a request as Returned to the Service Store (as R<PartNo>) or Not recyclable, with a reason',
      'See what each request cost — parts consumed at their stock-out cost plus other costs — and the total spent on recycling',
      'Download the requests and the MRS lines',
    ],
    records: ['rpc:register_recycle_requests', 'rpc:start_recycle_work', 'rpc:recycle_mrn_lines', 'rpc:recycle_sla_settings', 'material_returns', 'recycle_requests', 'recycle_request_list', 'recycle_mrs', 'recycle_mrs_lines', 'recycle_mrs_list', 'recycle_issues', 'recycle_hand_stock', 'recycle_consumption', 'recycle_consumption_list', 'recycle_other_costs', 'parts'],
    rules: [
      'A parallel track: nothing here reads or writes calls, spare requests, stock outs, consumption or the regular hand stock',
      'While Audit Mode is on the screen is hidden and the database returns nothing and refuses every write',
      'A part cannot be consumed beyond your recycling hand stock; an MRS line cannot be booked out beyond what it asked for',
      'A request closes only once its job done is recorded; Not recyclable needs a reason; a closed request cannot be changed',
      'Start Work is recorded once and never in the future; the SLA counts working days only, skipping the holiday weekdays set on the SLA page',
      'One request per spare; a request carries no serial',
      'While Audit Mode is on the whole page disappears, back to the home screen',
      'The returned spare is recorded as R<PartNo>; the Part Master and the regular stock are not changed',
      'Its six keys are granted to no role (the administrator passes anyway); give them on Roles & Permissions → Indoor Service',
    ],
  },
  {
    route: '/indoor/pdqc',
    purpose: 'Record the Pre-Delivery Quality Check (R/SER/QC/007) of an imported machine in the godown before billing — a register of its own, for any product.',
    does: [
      'Record a new check, numbered PDQC/YY/NNNN when saved: the product (from the Product Master), SL. No, date, measuring equipment ID, software version, HV and HT, checks 1–5 as OK / NOT OK, and the CMV/ACMV and PCMV readings at FiO2 21, 60 and 100%',
      'Open a check to see it or, with the right, correct it',
      'Print a check on the R/SER/QC/007 sheet',
      'Download the checks',
    ],
    records: ['pdqc_records', 'product_master'],
    rules: [
      'Every field is mandatory — a check cannot be saved with any of them blank',
      'Whoever saves the check is recorded as its inspector, with their designation from the User Master; a correction re-signs it as the person correcting it',
      'A record only: a NOT OK is recorded as it is, and billing is not blocked',
      'A check is never deleted',
      'Recording a check needs Record a Pre-Delivery Quality Check, given to no role (the administrator passes anyway)',
    ],
  },

  // ──────────────────────────────── Reports ───────────────────────────────
  {
    route: '/exports/consumption',
    purpose: 'One row per spare booked, with its call and that call’s latest visit, as an Excel or CSV file.',
    does: [
      'Filter by call date, product, customer, city, engineer, part, UCN or call type',
      'Tick extra columns; the report’s own format stays locked',
      'Download Excel or CSV',
    ],
    records: ['consumption_report', 'audit_log'],
    rules: [
      'Line ID, Source Ref Key and Created At are ticked to start with and can be unticked',
      'Where a call has no visit report, the visit dates fall back to the booking time — read them as “no later than” — and Visit UID is blank',
    ],
  },
  {
    route: '/exports/kpi',
    purpose: 'The KPI workbook’s Field_INST tab, in its own column order.',
    does: [
      'Choose the registered-from / to dates, or the whole register',
      'Download Excel or CSV',
    ],
    records: ['kpi_field_inst', 'audit_log'],
    rules: [
      'Field, installation and PM calls; cancelled calls are left out entirely',
    ],
  },
  {
    route: '/exports/unused',
    purpose: 'Parts sent against a solved call that were not booked: NOT USED where none was booked, SHORT where less was booked than sent.',
    does: [
      'Filter by dispatched date, engineer, product or part code',
      'Preview the first rows, then download Excel or CSV',
    ],
    records: ['unused_spare_report', 'audit_log'],
    rules: [
      'Refused and dropped lines are excluded',
    ],
  },
  {
    route: '/exports/calls',
    purpose: 'One row per call, never per visit, with its latest visit and what was fitted.',
    does: [
      'Filter by call date, product, customer, city, allotted-to, UCN, call type or status',
      'Tick the extra columns you want',
      'Download Excel or CSV',
    ],
    records: ['call_report', 'audit_log'],
    rules: [
      'It counts calls; Visit Reports counts visits — the two totals differ and both are right',
      'Voided spare lines are left out',
    ],
  },
  {
    route: '/exports/feedback',
    purpose: 'One row per customer feedback, each question its own column.',
    does: [
      'Filter by the feedback’s own date, product, customer, state, engineer, UCN, call type or source',
      'Download Excel or CSV',
    ],
    records: ['feedback_report', 'audit_log'],
    rules: [
      'A blank on a question means it was not asked of that kind of visit, not that it went unanswered',
      'The date filter is the feedback’s own date, never the day it was loaded',
    ],
  },
  {
    route: '/exports/stores-dispatch',
    purpose: 'Every spare Stores dispatched, with the days it took after the request\u2019s final approval -- the AppSheet Stores format.',
    does: [
      'Filter by dispatch date, engineer, part, Spare Request NO, days band, IND/IMP or Item Status',
      'Tick the extra columns you want',
      'Download Excel or CSV',
    ],
    records: ['stores_dispatch_report', 'audit_log'],
    rules: [
      'Days are exact elapsed time from the final approval (latest of RM, Commercial, NSM) to the dispatch, one decimal',
      'A line with no approval time recorded has a blank date and the band "No approval date", never ">5 yrs"',
      'IND/IMP comes from the Part Master',
    ],
  },
  {
    route: '/feedback-without-report',
    purpose: 'Calls where the customer gave feedback but the visit was never written up.',
    does: [
      'See each such feedback with which of four things is missing',
      'Filter by finding, search, and export to Excel or CSV',
    ],
    records: ['feedback_without_report', 'audit_log'],
    rules: [
      'It names the gap: no UCN on the feedback, no such call, no visit at all, or no visit reading “Solved - Report Completed”',
      'Any completed visit counts, not just the latest; a trailing space or different capitals is not a missing report',
    ],
  },
  {
    route: '/install-calls-unmapped',
    purpose: 'Warranty machines with no installation call mapped to them, why, and the calls that could be theirs.',
    does: [
      'See each machine with the reason it has no call and the candidate installation calls',
      'Filter by reason, search, and export to Excel (dates as dates) or CSV',
    ],
    records: ['rpc:install_calls_unmapped', 'sale_items', 'sale_entries', 'calls', 'audit_log'],
    rules: [
      'Administrators only, unless the page is ticked for another role on Roles & Permissions',
      'It changes nothing: map a call from the Warranty Register, where the machine is',
      'Only installation calls are ever matched or offered',
    ],
  },
  {
    route: '/handstock-report',
    purpose: 'One line per engineer and part, with the workings beside On Hand, as a complete downloadable file.',
    does: [
      'Let it load every line, then download CSV, .xlsx or .xls',
      'Search before downloading to take only those rows',
    ],
    records: ['handstock_balance', 'rpc:handstock_balance_all', 'audit_log'],
    rules: [
      'Downloads stay greyed out until every line has loaded — a short stock file is a wrong one',
      'An office role gets every engineer; anyone else gets their own stock and their team’s, and the file says which',
      'A negative On Hand is picked out as a finding',
    ],
  },

  // ──────────────────────────────── Master ────────────────────────────────
  {
    route: '/parties',
    purpose: 'Your customers, who looks after each one, and their KYC.',
    does: [
      'Browse and filter customers by name, state, city and type',
      'Click a party to edit contact details, both addresses and the Serviceman — or to read it, if you may not edit',
      'Set KYC status and attach KYC records to the customer’s Drive folder',
      '✎ Change engineer: correct one Serviceman spelling across every customer at once',
    ],
    records: ['parties', 'rpc:swap_service_engineer'],
    rules: [
      'The party name cannot be edited — every machine, call and contract names the customer by it',
      'Verified records who and when; documents alone never make a customer verified',
      'The Serviceman fills Call Allocated To on a new call only when the machine has no engineer',
    ],
  },
  {
    route: '/product-database',
    purpose: 'Every machine by model and serial, with its warranty, contract and current owner — where a call reads cover from.',
    does: [
      'Search by party, product, serial or status',
      'Turn on any of the 32 columns with ⚙ Columns; export all of them',
      'Start a Field or Installation call from a machine',
    ],
    records: ['products', 'product_database'],
    rules: [
      'Read only: machines arrive through Bulk Uploads, the cover registers and ownership transfers',
      'Warranty Status and Contract Status are the file’s own words, not the status worked out from the dates',
    ],
  },
  {
    route: '/product-database-2',
    purpose: 'The same machines, worked out rather than stored: one row per model and serial, assembled from the sale, contract, additional entry, ownership transfer and installation call registers.',
    does: [
      'Search and filter by status',
      'Click a row for the whole record, with links to the SA, contract, transfer, installation call and Machine History',
      'See “Live as of …”, or press ⟳ Rebuild from the registers',
      'Export to CSV',
    ],
    records: ['product_database_v2', 'rpc:refresh_product_database_2'],
    rules: [
      'It does not replace the Product Database — compare the two before trusting either',
      'A machine needs both a model and a serial to be listed',
      'Warranty decides before contract (WGP); a contract with no type reads CONTRACT (TYPE NOT RECORDED)',
    ],
  },
  {
    route: '/product-master',
    purpose: 'The list of product lines — one row per product code: type, category, short form, and whether it is still sold. Not the machines.',
    does: [
      'Search product lines and filter All / Active / Inactive',
      'Set whether a line is Imported (Yes / No) — with the right to edit master records',
      'Export to CSV',
    ],
    records: ['product_master'],
    rules: [
      'Inactive stops only a new Sale Entry; machines already sold still take contracts, calls, visits, spares and feedback',
      'Imported decides whether a DEMO unit of the line owes Pre-Delivery Testing (R/SER/QC/007); blank means not known, and the test is then not demanded',
      'Everything else is changed through Bulk Uploads → Product Master, not on this screen',
    ],
  },
  {
    route: '/user-master',
    purpose: 'People, roles and the reporting line — a manager’s team is worked out from here.',
    does: [
      'Edit people, their Department, managers and role; create, clone or disable a login',
      'Set a person’s Access: the role plus extra permissions for them alone',
      'Open a person for their profile, Roles & Responsibilities and training',
      'Reset a password (shown once)',
    ],
    records: ['user_directory', 'profiles', 'rpc:admin_reset_password', 'audit_log'],
    rules: [
      'Designation is the job; the role (Permission) is what the app lets them do — they often differ',
      'You cannot change your own role; a role not on Roles & Permissions grants nothing',
      'Correcting a name moves everything filed under the old name; only an administrator can change a name',
    ],
  },
  {
    route: '/parts',
    purpose: 'The item catalogue: add, edit, rename and retire parts, map them to products, and map each main product to its accessories.',
    does: [
      'Search everything; filter by product, Common or ⚠ Unrecognised',
      '＋ Add part: code, description, Spare / Consumable, products (or Common), HSN Code, cost',
      'Rename a part — the screen shows first how many records will move',
      'Tick parts to set, add or remove products, or set Spare / Consumable, in bulk',
      'Map each main product to its accessories',
    ],
    records: ['parts', 'product_accessories', 'product_register_names', 'masters', 'rpc:part_rename_impact', 'rpc:rename_part'],
    rules: [
      'Code and description together are the part’s identity; a rename to a name already taken is refused',
      'HSN Code is digits only, in its own column',
      'An inactive part stays on old records but is not offered in pickers; parts are never deleted',
    ],
  },
  {
    route: '/masters',
    purpose: 'The value lists behind the dropdowns, with a count for each and the four registers beside them.',
    does: [
      'See every list with its entry count and where it is used',
      'Open a list to add, deactivate or reactivate values',
      'Map Standard Complaints to products, one at a time or in bulk',
      'Export a list to CSV',
    ],
    records: ['master_lists', 'masters', 'parties', 'products', 'parts', 'user_directory'],
    rules: [
      'Rights are per list',
      'Deactivate a value to stop it being offered; 🗑 deletes it outright and does not check whether records use it',
    ],
  },
  {
    route: '/masters/calltype',
    purpose: 'The Call Type list used on the request form.',
    does: [
      'Add, deactivate or reactivate a call type',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'A duplicate value is refused; a deactivated value stays on records but is no longer offered',
    ],
  },
  {
    route: '/masters/complaint',
    purpose: 'The Standard Complaint list used on every call form and the call report.',
    does: [
      'Add a complaint and tick the products it applies to (none = all products)',
      'Filter by complaint name or product',
      'Tick complaints and Set / Add / Remove products in bulk',
      'Export with the Key, to re-upload through Bulk Uploads',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'A call form offers the complaints mapped to its product plus those for all products',
      'No free text anywhere: a Standard Complaint must come from this list',
      'An upload never renames a complaint; a row with a Key updates only that complaint’s products',
    ],
  },
  {
    route: '/masters/pendingreason',
    purpose: 'The Call Pending Reason list, offered when a visit leaves a call Unsolved.',
    does: [
      'Add, deactivate or reactivate a reason',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'An Unsolved visit must give a reason from this list',
    ],
  },
  // NO SCREEN READS `cancelreason` TODAY (checked 2026-10-02): cancelling a
  // request on Pending Registrations takes a FREE-TEXT reason by design
  // (PendingRegistrations.tsx). masterLists.ts now says so too.
  {
    route: '/masters/cancelreason',
    purpose: 'The Call Cancel Reason list: the reasons a call may be cancelled for.',
    does: [
      'Add, deactivate or reactivate a reason',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'Cancelling a call REQUEST on Pending Registrations takes a typed reason, not this list',
    ],
  },
  {
    route: '/masters/feedbackrating',
    purpose: 'The Feedback Rating list used for the customer feedback ratings.',
    does: [
      'Add, deactivate or reactivate a rating',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'A deactivated rating stays on old feedback but is no longer offered',
    ],
  },
  {
    route: '/masters/orapproval',
    purpose: 'The Spare Approval Reason list. Nothing reads it at present: the Commercial and NSM forms offer a fixed list of reasons.',
    does: [
      'Add, deactivate or reactivate a reason',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'A deactivated reason stays on decided spares but is no longer offered',
    ],
  },
  {
    route: '/masters/dccrgrouping',
    purpose: 'The DCCR Complaint Grouping list, used in Review 3 of the Daily Complaint Review Register.',
    does: [
      'Add, deactivate or reactivate a grouping',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'Values are tagged per product; one tagged COMM is common to every product',
      'Review 3 keeps a value already chosen even if it is later taken off the list',
    ],
  },
  {
    route: '/masters/rootcause',
    purpose: 'The Root Cause Key Word list, used in Review 3 of the Daily Complaint Review Register.',
    does: [
      'Add, deactivate or reactivate a key word',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'Values are tagged per product; one tagged COMM is common to every product',
    ],
  },
  {
    route: '/masters/department',
    purpose: 'The departments people belong to, used on the User Master and when choosing who to train.',
    does: [
      'Add, deactivate or reactivate a department',
      'Export the list',
    ],
    records: ['masters', 'master_lists'],
    rules: [
      'Add the departments here first — the User Master picks from this list, so it is spelled one way everywhere',
    ],
  },

  // ──────────────────────────── Administration ────────────────────────────
  {
    route: '/missing-visit-reports',
    purpose: 'Every call that reads Solved while its visit record is incomplete — the list of what to re-upload.',
    does: [
      'See each call with its gaps, and filter by gap',
      'Search, and export to Excel or CSV',
    ],
    records: ['solved_without_report', 'audit_log'],
    rules: [
      'It names four gaps: no visit at all, no visit date, no service report, entry date looks like an import stamp',
      'Solved includes “Solved - Report Pending”, and the row says which',
    ],
  },
  {
    route: '/tracker',
    purpose: 'The shared activity list.',
    does: [
      'Add an item',
      'Edit title, detail, owner, area, status or due date in place',
      'Show Done and Dropped items when you need them',
    ],
    records: ['tracker_items', 'tracker_list', 'audit_log'],
    rules: [
      'Anyone who can open it can add and edit; who raised an item is stamped and cannot be rewritten',
      'Nothing is auto-deleted; Done and Dropped stay and are hidden',
    ],
  },
  {
    route: '/roles',
    purpose: 'Which role holds which right, page by page and action by action, laid out like the menu.',
    does: [
      'Tick or untick a page and each action on it, per role',
      'Add a new role by copying an existing one',
      'Export the matrix to Excel',
    ],
    records: ['app_roles', 'master_lists', 'audit_log'],
    rules: [
      'Only the Admin column is greyed — Admin holds everything',
      'Unticking an item granted by an “all of the below” tick unticks that tick and keeps the other items ticked',
      'A role with some permissions but not “View calls” sees an empty register; a missing menu entry is the page tick',
      'A role cannot be saved with nothing ticked, and roles are not deleted here',
    ],
  },
  {
    route: '/audit',
    purpose: 'What the application recorded — actions, sign-ins, errors and how long they took.',
    does: [
      'Filter by action, email or status',
      'Load more, and export the loaded rows to CSV',
    ],
    records: ['audit_log'],
    rules: [
      'Needs the audit permission to open',
    ],
  },
  {
    route: '/bulk-uploads',
    purpose: 'The importer: one uploader per register — pick the register and a file, preview, then write.',
    does: [
      'Pick a register and a CSV; the heading row is found even under a letterhead',
      'Read the preview: rows ready, rows held back with the reason, columns kept and ignored',
      'Confirm and write in batches',
    ],
    records: ['field_calls', 'installation_calls', 'pm_calls', 'reports', 'call_requests', 'spare_requests', 'spare_request_lines', 'spare_dispatches', 'spare_issue_history', 'spare_consumption', 'spare_consumption_history', 'handstock_opening', 'material_returns', 'stock_transfers', 'stock_transfer_lines', 'feedback', 'field_failure_reports', 'call_reviews', 'parties', 'products', 'product_master', 'parts', 'ownership_transfers', 'product_additional_entries', 'sale_entries', 'sale_items', 'contract_entries', 'contract_items', 'documents', 'masters', 'installation_warranty_starts'],
    rules: [
      'A row missing a required column is held back and named, never loaded as a fragment',
      'A register with a key is corrected by a re-load; one without (MRN Register, Stock Transfer Lines) is duplicated, and the screen warns you',
      'Dates are read day-first; unrecognised columns are kept on the row where the register allows it',
    ],
  },
  {
    route: '/report-mapping',
    purpose: 'Attaches a batch of visit reports to their calls, and turns the AppSheet references already in the register into Drive links.',
    does: [
      'Survey the register for references that open nothing',
      'Resolve them in Drive and Convert, in passes',
      'Load a CSV of reports, match each to its call, and attach or file the visit',
    ],
    records: ['reports', 'calls'],
    rules: [
      'A file Drive cannot find, or finds twice, keeps its reference',
      'Nothing else on the visit changes; the old reference is kept in Source Ref',
    ],
  },
  {
    route: '/data-export',
    purpose: 'Tick the tables you want and download them as one ZIP with a CSV per table, or schedule them to arrive by email.',
    does: [
      'Tick tables and export them as a ZIP',
      'Create a schedule: every day or one weekday, at a time in IST',
      'Pause, resume, edit or delete a schedule; read what has been sent',
    ],
    records: ['rpc:exportable_tables', 'export_schedules', 'export_schedule_state', 'export_runs'],
    rules: [
      'The export runs as you — it holds only the rows you may see',
      'You choose which tables and when, never where it goes; an audit trail can never be scheduled',
      'Row counts are estimates and say “approx.”',
    ],
  },
  {
    route: '/device-cache',
    purpose: 'Which phones and laptops hold the machine register and Party Master for offline search, and how old each copy is.',
    does: [
      'See one row per person per device, with counts and download times',
      'Filter by state, including Never reported',
    ],
    records: ['rpc:device_cache_report', 'device_cache_status'],
    rules: [
      'A device reports after each download and on sign-out — one switched off shows its last report',
    ],
  },
  {
    route: '/pm-bulk-upload',
    purpose: 'Loads a month’s PM schedule as PM calls in one go.',
    does: [
      'Download the template and choose a CSV',
      'Pick the due month and the registration times for the batch',
      'Preview, then import',
    ],
    records: ['calls', 'pm_calls'],
    rules: [
      'Every call is dated the 1st of the chosen month',
      'Re-importing the same file creates the calls a second time',
    ],
  },
  // Audit Mode and the Data Import panel are gated on their own permissions
  // (`audit.mode`, `import.panel`); the handbook was corrected to match (2026-10-02).
  {
    route: '/admin-config',
    purpose: 'The settings the rules read: the Call Registration desk and Audit Mode. The SLA targets and the frequent-failure rule are on SLA / Objective Configuration.',
    does: [
      'Choose which Hotline desk new calls are filed to',
      'Switch Audit Mode on or off with a reason',
    ],
    records: ['app_settings', 'rpc:registrant_desks', 'rpc:audit_mode', 'rpc:set_audit_mode', 'audit_mode_changes'],
    rules: [
      'A desk change applies from now on; calls already filed are unchanged',
      'While Audit Mode is ON, Update Party / Product Details on a call are hidden and refused',
    ],
  },
  // SLA / OBJECTIVE CONFIGURATION (0357, the user, 2026-10-04).
  {
    route: '/sla-objective-config',
    purpose: 'The targets the service is measured against: the SLA hours for open calls, the Product Failure rule the Objective page works its failure rates out by, and the frequent-failure rule Review 2 applies.',
    does: [
      'Set each SLA target in hours and turn it on or off',
      'Set how many months after installation a field call counts as a product failure (3 by default)',
      'Set the rolling period the failure rate is measured over (12 months by default)',
      'Tune frequent-failure Rule 1 (same machine) and Rule 2 (different serials, same complaint)',
    ],
    records: ['sla_rules', 'objective_settings', 'app_settings', 'rpc:frequent_failure_rule'],
    rules: [
      'Installation is the machine’s warranty start; a machine with no warranty start is in neither number',
      'A machine with several calls inside its window is one failure',
      'A change applies from the next Re-Calculate on the Objective page; figures already written are not rewritten',
      'A frequent-failure rule change applies from now on; Review 2 answers already recorded are unchanged',
      'Admin has this page with every action; Technical Support has the page read-only until its actions are ticked; other roles are granted on Roles & Permissions',
    ],
  },
  {
    route: '/software-validation',
    purpose: 'The ISO 13485 §4.1.6 software validation package: intended use, requirements and the tests that answer them.',
    does: [
      'Read the package by tab, including Requirements by Module and the Traceability Matrix',
      'Record each test’s result, actual result and tester',
      'Read Data Flows — how a record moves from screen to screen',
      'Print the tab or the whole package',
    ],
    records: ['validation_results'],
    rules: [
      'Software validation does not discharge a servicing process requirement — the two are separate documents',
    ],
  },
  {
    route: '/settings',
    purpose: 'The database and CallReg sheet connections for this browser; your theme and account are on My Profile.',
    does: [
      'Set the database and CallReg sheet connections for this browser',
      'Test a connection',
    ],
    records: [], // stored in this browser, not the database
    rules: [
      'Changing it needs the settings permission; anyone with admin view sees it read-only',
      'The connection is saved in this browser only, not for everyone',
    ],
  },
  {
    route: '/version-history',
    purpose: 'What changed in each release.',
    does: [
      'See the current version and build',
      'Read the change log',
    ],
    records: [], // from the app’s own change log, not the database
    rules: [
      'Read only; the version shown is the build this tab is running — the update banner says when a newer one is out',
    ],
  },
];
